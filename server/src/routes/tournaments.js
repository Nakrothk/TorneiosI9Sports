const express = require('express')
const prisma  = require('../lib/prisma')

const router = express.Router()

const tInclude = {
  entries: { include: { team: true }, orderBy: { seed: 'asc' } },
  matches: {
    include: { teamA: true, teamB: true, court: true },
    orderBy: [{ position: 'asc' }],
  },
}

// ── GET /tournaments ────────────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const list = await prisma.tournament.findMany({
      include: tInclude,
      orderBy: { createdAt: 'asc' },
    })
    res.json(list)
  } catch (err) { next(err) }
})

// ── POST /tournaments ───────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { name, category, group, type } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' })
    const t = await prisma.tournament.create({
      data: {
        name:     name.trim(),
        category: category?.trim() || '',
        group:    group?.trim()    || '',
        type:     (type === 'ffa') ? 'ffa' : 'bracket',
      },
      include: tInclude,
    })
    res.status(201).json(t)
  } catch (err) { next(err) }
})

// ── POST /tournaments/create-event ─────────────────────────────
// Creates N group tournaments at once for an event (numGroups: 2–6).
router.post('/create-event', async (req, res, next) => {
  try {
    const { name, category, numGroups } = req.body
    if (!name?.trim() || !category?.trim()) {
      return res.status(400).json({ error: 'name e category são obrigatórios' })
    }
    const n = parseInt(numGroups)
    if (!n || n < 2 || n > 6) {
      return res.status(400).json({ error: 'numGroups deve ser entre 2 e 6' })
    }

    const existing = await prisma.tournament.findFirst({
      where: { name: name.trim(), category: category.trim(), group: { not: '' } },
    })
    if (existing) {
      return res.status(400).json({ error: 'Já existe um evento com este nome e categoria' })
    }

    const letters = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n)
    const created = []
    for (const g of letters) {
      const t = await prisma.tournament.create({
        data: { name: name.trim(), category: category.trim(), group: g },
        include: tInclude,
      })
      created.push(t)
    }
    res.status(201).json(created)
  } catch (err) { next(err) }
})

// ── POST /tournaments/generate-bracket ─────────────────────────
// Must be declared before /:id routes to avoid Express matching
// "generate-bracket" as an id param.
router.post('/generate-bracket', async (req, res, next) => {
  try {
    const { name, category } = req.body
    if (!name || !category) {
      return res.status(400).json({ error: 'name e category são obrigatórios' })
    }

    // Find all group-stage tournaments for this event/category
    const groupTournaments = await prisma.tournament.findMany({
      where: { name, category, group: { not: '' } },
      include: {
        entries: { include: { team: true }, orderBy: { seed: 'asc' } },
        matches: { include: { teamA: true, teamB: true } },
      },
      orderBy: { group: 'asc' },
    })

    if (groupTournaments.length < 2) {
      return res.status(400).json({ error: 'Necessário ao menos 2 grupos para gerar a chave final' })
    }

    // Validate: every group must have matches and all finished
    for (const t of groupTournaments) {
      if (t.matches.length === 0) {
        return res.status(400).json({ error: `Grupo ${t.group}: partidas ainda não foram geradas` })
      }
      const pending = t.matches.filter(m => m.status !== 'finished')
      if (pending.length > 0) {
        return res.status(400).json({
          error: `Grupo ${t.group}: ${pending.length} partida(s) ainda não finalizadas`,
        })
      }
    }

    // Delete existing bracket if present (allows regeneration)
    const existing = await prisma.tournament.findFirst({
      where: { name, category, group: '' },
    })
    if (existing) {
      await prisma.match.deleteMany({ where: { tournamentId: existing.id } })
      await prisma.tournament.delete({ where: { id: existing.id } })
    }

    // Calculate standings per group
    const byGroup = {}
    for (const t of groupTournaments) {
      byGroup[t.group] = calcStandings(t.entries, t.matches)
    }

    const numGroups = groupTournaments.length

    // Create the bracket tournament (no group = it's the final stage)
    const bt = await prisma.tournament.create({
      data: { name, category, group: '' },
    })

    if (numGroups === 2) {
      // 4 classified: 1A, 2A, 1B, 2B
      // Semis: 1A vs 2B, 1B vs 2A
      const groups = Object.keys(byGroup).sort()
      const [gA, gB] = groups
      const top = { [gA]: byGroup[gA].slice(0, 2), [gB]: byGroup[gB].slice(0, 2) }
      await buildSemiFinal(bt.id, category, [
        { a: top[gA][0].teamId, b: top[gB][1].teamId },
        { a: top[gB][0].teamId, b: top[gA][1].teamId },
      ])

    } else if (numGroups === 3) {
      // 6 classified → top 2 by saldo get a bye straight to semi; bottom 4 play quarters
      const all6 = Object.entries(byGroup).flatMap(([g, standings]) =>
        standings.slice(0, 2).map(s => ({ ...s, groupName: g }))
      )
      all6.sort((a, b) => b.S - a.S || b.P - a.P || b.GP - a.GP || b.V - a.V)
      // [0],[1] = byes (best saldo); [2],[3],[4],[5] = quarterfinals
      await buildThreeGroupBracket(bt.id, category, all6)

    } else if (numGroups === 4) {
      // 8 classified: 1A,2A,1B,2B,1C,2C,1D,2D
      // Quartas: 1A×2B, 1B×2A, 1C×2D, 1D×2C
      const groups = Object.keys(byGroup).sort()
      const [gA, gB, gC, gD] = groups
      const top = {}
      for (const g of groups) top[g] = byGroup[g].slice(0, 2)
      await buildQuarterFinal(bt.id, category, [
        { a: top[gA][0].teamId, b: top[gB][1].teamId },
        { a: top[gB][0].teamId, b: top[gA][1].teamId },
        { a: top[gC][0].teamId, b: top[gD][1].teamId },
        { a: top[gD][0].teamId, b: top[gC][1].teamId },
      ])

    } else {
      // Fallback for other group counts: take top 2 from each, rank all, use top 8
      const allClassified = Object.values(byGroup).flatMap(s => s.slice(0, 2))
      allClassified.sort((a, b) => b.P - a.P || b.S - a.S || b.GP - a.GP || b.V - a.V)
      const top8 = allClassified.slice(0, 8)
      if (top8.length <= 4) {
        await buildSemiFinal(bt.id, category, [
          { a: top8[0].teamId, b: top8[3].teamId },
          { a: top8[1].teamId, b: top8[2].teamId },
        ])
      } else {
        await buildQuarterFinal(bt.id, category, [
          { a: top8[0].teamId, b: top8[7].teamId },
          { a: top8[3].teamId, b: top8[4].teamId },
          { a: top8[1].teamId, b: top8[6].teamId },
          { a: top8[2].teamId, b: top8[5].teamId },
        ])
      }
    }

    res.status(201).json(await getTournament(bt.id))
  } catch (err) { next(err) }
})

// ── POST /tournaments/:id/teams ─────────────────────────────────
router.post('/:id/teams', async (req, res, next) => {
  try {
    const { teamId, colorTeam } = req.body
    if (!teamId) return res.status(400).json({ error: 'teamId é obrigatório' })

    const exists = await prisma.tournamentEntry.findFirst({
      where: { tournamentId: req.params.id, teamId },
    })
    if (exists) return res.status(400).json({ error: 'Dupla já está neste torneio' })

    const count = await prisma.tournamentEntry.count({ where: { tournamentId: req.params.id } })
    await prisma.tournamentEntry.create({
      data: { tournamentId: req.params.id, teamId, seed: count + 1, colorTeam: colorTeam || '' },
    })

    res.json(await getTournament(req.params.id))
  } catch (err) { next(err) }
})

// ── DELETE /tournaments/:id/teams/:teamId ───────────────────────
router.delete('/:id/teams/:teamId', async (req, res, next) => {
  try {
    await prisma.tournamentEntry.deleteMany({
      where: { tournamentId: req.params.id, teamId: req.params.teamId },
    })
    const remaining = await prisma.tournamentEntry.findMany({
      where: { tournamentId: req.params.id },
      orderBy: { seed: 'asc' },
    })
    for (let i = 0; i < remaining.length; i++) {
      await prisma.tournamentEntry.update({
        where: { id: remaining[i].id },
        data: { seed: i + 1 },
      })
    }
    res.json(await getTournament(req.params.id))
  } catch (err) { next(err) }
})

// ── POST /tournaments/:id/generate ─────────────────────────────
router.post('/:id/generate', async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { entries: { include: { team: true }, orderBy: { seed: 'asc' } } },
    })
    if (!tournament) return res.status(404).json({ error: 'Torneio não encontrado' })
    if (tournament.entries.length < 2) {
      return res.status(400).json({ error: 'Mínimo 2 duplas para gerar a chave' })
    }

    await prisma.match.deleteMany({ where: { tournamentId: req.params.id } })

    const teamIds  = tournament.entries.map(e => e.teamId)
    const schedule = generateRoundRobin(teamIds)

    let pos = 1
    for (const { round, pairs } of schedule) {
      for (const { teamAId, teamBId } of pairs) {
        await prisma.match.create({
          data: {
            teamAId,
            teamBId,
            tournamentId: req.params.id,
            category:     tournament.category,
            round:        `${round}ª Rodada`,
            position:     pos++,
            status:       'waiting',
          },
        })
      }
    }

    res.json(await getTournament(req.params.id))
  } catch (err) { next(err) }
})

// ── DELETE /tournaments/:id/matches ────────────────────────────
// Remove apenas as partidas (chave), mantendo o torneio e as duplas inscritas.
router.delete('/:id/matches', async (req, res, next) => {
  try {
    await prisma.match.deleteMany({ where: { tournamentId: req.params.id } })
    res.json(await getTournament(req.params.id))
  } catch (err) { next(err) }
})

// ── DELETE /tournaments/:id ─────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.match.deleteMany({ where: { tournamentId: req.params.id } })
    await prisma.tournamentEntry.deleteMany({ where: { tournamentId: req.params.id } })
    await prisma.tournament.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── DELETE /tournaments/:id/ffa-teams/:teamId ───────────────────
router.delete('/:id/ffa-teams/:teamId', async (req, res, next) => {
  try {
    await prisma.tournamentEntry.deleteMany({
      where: { tournamentId: req.params.id, teamId: req.params.teamId },
    })
    res.json(await getTournament(req.params.id))
  } catch (err) { next(err) }
})

// ── PUT /tournaments/:id/teams/:teamId/color ────────────────────
router.put('/:id/teams/:teamId/color', async (req, res, next) => {
  try {
    const { colorTeam } = req.body
    await prisma.tournamentEntry.updateMany({
      where: { tournamentId: req.params.id, teamId: req.params.teamId },
      data:  { colorTeam: colorTeam || '' },
    })
    res.json(await getTournament(req.params.id))
  } catch (err) { next(err) }
})

// ── POST /tournaments/:id/ffa-batch-teams ───────────────────────
// Add multiple teams to a color team at once
router.post('/:id/ffa-batch-teams', async (req, res, next) => {
  try {
    const { colorTeam, teamIds } = req.body
    if (!colorTeam) return res.status(400).json({ error: 'colorTeam é obrigatório' })
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ error: 'teamIds deve ser um array não-vazio' })
    }

    let added = 0
    for (const teamId of teamIds) {
      const existing = await prisma.tournamentEntry.findFirst({
        where: { tournamentId: req.params.id, teamId },
      })
      if (existing) {
        await prisma.tournamentEntry.update({
          where: { id: existing.id },
          data:  { colorTeam },
        })
      } else {
        const count = await prisma.tournamentEntry.count({ where: { tournamentId: req.params.id } })
        await prisma.tournamentEntry.create({
          data: { tournamentId: req.params.id, teamId, seed: count + 1, colorTeam },
        })
      }
      added++
    }

    res.json({ added, tournament: await getTournament(req.params.id) })
  } catch (err) { next(err) }
})

// ── POST /tournaments/:id/ffa-auto-generate ──────────────────────
// Auto-generate all group matches from existing entries
// Groups entries by (team.category, colorTeam), then pairs Verde[i]×Amarelo[i]×Azul[i]×Branco[i]
router.post('/:id/ffa-auto-generate', async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        entries: { include: { team: true }, orderBy: { seed: 'asc' } },
      },
    })
    if (!tournament) return res.status(404).json({ error: 'Torneio não encontrado' })

    const COLORS = ['Verde', 'Amarelo', 'Azul', 'Branco']

    // Group entries by (category, colorTeam) so same-category teams only face each other
    const catColorMap = {} // { [category]: { [color]: teamId[] } }
    for (const entry of tournament.entries) {
      const cat = entry.team?.category || ''
      if (!catColorMap[cat]) catColorMap[cat] = {}
      if (!catColorMap[cat][entry.colorTeam]) catColorMap[cat][entry.colorTeam] = []
      catColorMap[cat][entry.colorTeam].push(entry.teamId)
    }

    if (Object.keys(catColorMap).length === 0) {
      return res.status(400).json({ error: 'Nenhuma dupla cadastrada no torneio.' })
    }

    // Delete existing group matches (keep finals)
    await prisma.match.deleteMany({
      where: {
        tournamentId: req.params.id,
        round:        { notIn: ['semi', 'final', 'terceiro lugar'] },
      },
    })

    let pos = 1
    let matchesCreated = 0

    // For each category, pair teams of the same category across colors
    for (const [cat, colorMap] of Object.entries(catColorMap)) {
      const activeColors = COLORS.filter(c => colorMap[c]?.length > 0)
      if (activeColors.length < 2) continue

      const rounds = Math.min(...activeColors.map(c => colorMap[c].length))
      for (let i = 0; i < rounds; i++) {
        const ids = activeColors.map(c => colorMap[c][i])
        for (let a = 0; a < ids.length; a++) {
          for (let b = a + 1; b < ids.length; b++) {
            await prisma.match.create({
              data: {
                teamAId:      ids[a],
                teamBId:      ids[b],
                tournamentId: req.params.id,
                category:     cat,
                round:        '',
                position:     pos++,
                status:       'waiting',
              },
            })
            matchesCreated++
          }
        }
      }
    }

    if (matchesCreated === 0) {
      return res.status(400).json({
        error: 'Nenhuma partida gerada. Verifique se há duplas da mesma categoria em times diferentes.',
      })
    }

    res.status(201).json({ matchesCreated, tournament: await getTournament(req.params.id) })
  } catch (err) { next(err) }
})

// ── POST /tournaments/:id/ffa-groups ────────────────────────────
// Create a FFA group: 4 entries (one per color) + 6 round-robin matches
router.post('/:id/ffa-groups', async (req, res, next) => {
  try {
    const { category, entries } = req.body
    // entries: [{ teamId, colorTeam }] — exactly 4 with distinct colors
    if (!category?.trim()) return res.status(400).json({ error: 'category é obrigatória' })
    if (!Array.isArray(entries) || entries.length !== 4) {
      return res.status(400).json({ error: 'Necessário exatamente 4 duplas (uma por time)' })
    }
    const COLORS = ['Verde', 'Amarelo', 'Azul', 'Branco']
    const colors = entries.map(e => e.colorTeam)
    if (!COLORS.every(c => colors.includes(c))) {
      return res.status(400).json({ error: 'É necessário uma dupla de cada time (Verde, Amarelo, Azul, Branco)' })
    }

    // Determine group number for this category
    const existingGroups = await prisma.match.findMany({
      where: { tournamentId: req.params.id, category: category.trim() },
      select: { round: true },
      distinct: ['round'],
    })
    const groupNums = existingGroups
      .map(m => parseInt(m.round?.replace('G', '') || '0'))
      .filter(n => !isNaN(n))
    const nextGroup = groupNums.length > 0 ? Math.max(...groupNums) + 1 : 1
    const groupName = `G${nextGroup}`

    // Ensure each dupla has a TournamentEntry with colorTeam
    for (const entry of entries) {
      const existing = await prisma.tournamentEntry.findFirst({
        where: { tournamentId: req.params.id, teamId: entry.teamId },
      })
      if (existing) {
        if (existing.colorTeam !== entry.colorTeam) {
          await prisma.tournamentEntry.update({
            where: { id: existing.id },
            data:  { colorTeam: entry.colorTeam },
          })
        }
      } else {
        const count = await prisma.tournamentEntry.count({ where: { tournamentId: req.params.id } })
        await prisma.tournamentEntry.create({
          data: { tournamentId: req.params.id, teamId: entry.teamId, seed: count + 1, colorTeam: entry.colorTeam },
        })
      }
    }

    // Generate 6 round-robin matches (C(4,2) = 6)
    const ids = entries.map(e => e.teamId)
    const pairs = []
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pairs.push({ teamAId: ids[i], teamBId: ids[j] })
      }
    }

    const existing = await prisma.match.count({ where: { tournamentId: req.params.id } })
    let pos = existing + 1
    for (const pair of pairs) {
      await prisma.match.create({
        data: {
          teamAId:      pair.teamAId,
          teamBId:      pair.teamBId,
          tournamentId: req.params.id,
          category:     category.trim(),
          round:        groupName,
          position:     pos++,
          status:       'waiting',
        },
      })
    }

    res.status(201).json(await getTournament(req.params.id))
  } catch (err) { next(err) }
})

// ── GET /tournaments/:id/ffa-standings ──────────────────────────
router.get('/:id/ffa-standings', async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        entries: { include: { team: true } },
        matches: { include: { teamA: true, teamB: true } },
      },
    })
    if (!tournament) return res.status(404).json({ error: 'Torneio não encontrado' })

    const COLORS = ['Verde', 'Amarelo', 'Azul', 'Branco']
    const teamColor = new Map(tournament.entries.map(e => [e.teamId, e.colorTeam]))

    const standings = {}
    for (const c of COLORS) standings[c] = { colorTeam: c, wins: 0, losses: 0, draws: 0, played: 0 }

    for (const m of tournament.matches) {
      if (m.status !== 'finished') continue
      const colorA = teamColor.get(m.teamAId) || null
      const colorB = teamColor.get(m.teamBId) || null
      if (!colorA || !colorB) continue

      if (standings[colorA]) standings[colorA].played++
      if (standings[colorB]) standings[colorB].played++

      if (m.scoreA > m.scoreB) {
        if (standings[colorA]) standings[colorA].wins++
        if (standings[colorB]) standings[colorB].losses++
      } else if (m.scoreB > m.scoreA) {
        if (standings[colorB]) standings[colorB].wins++
        if (standings[colorA]) standings[colorA].losses++
      } else {
        if (standings[colorA]) standings[colorA].draws++
        if (standings[colorB]) standings[colorB].draws++
      }
    }

    const result = Object.values(standings)
      .sort((a, b) => b.wins - a.wins || b.played - a.played)
    res.json(result)
  } catch (err) { next(err) }
})

// ── POST /tournaments/:id/ffa-finals ────────────────────────────
// Generate final bracket for FFA: uses teamIds from top-ranked color teams
router.post('/:id/ffa-finals', async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        entries: { include: { team: true } },
        matches: { include: { teamA: true, teamB: true } },
      },
    })
    if (!tournament) return res.status(404).json({ error: 'Torneio não encontrado' })

    // Get standings
    const COLORS = ['Verde', 'Amarelo', 'Azul', 'Branco']
    const teamColor = new Map(tournament.entries.map(e => [e.teamId, e.colorTeam]))
    const standings = {}
    for (const c of COLORS) standings[c] = { colorTeam: c, wins: 0, teamIds: [] }
    for (const e of tournament.entries) {
      if (standings[e.colorTeam]) standings[e.colorTeam].teamIds.push(e.teamId)
    }
    for (const m of tournament.matches) {
      if (m.status !== 'finished' || !m.winnerTeamId) continue
      const color = teamColor.get(m.winnerTeamId)
      if (color && standings[color]) standings[color].wins++
    }

    const ranked = Object.values(standings).sort((a, b) => b.wins - a.wins)

    // Delete existing finals matches for this tournament
    await prisma.match.deleteMany({
      where: { tournamentId: req.params.id, round: { in: ['semi', 'final', 'terceiro lugar'] } },
    })

    // Representatives: for each color team, pick the entry with highest wins
    // (if no specific dupla is given, pick first one)
    const { category } = req.body // optional: finals category
    const cat = category?.trim() || tournament.category || ''

    const rep = (colorStandings) => {
      // Pick from teamIds of this colorTeam
      return colorStandings.teamIds[0] || null
    }

    const [first, second, third, fourth] = ranked

    if (!first?.teamIds[0] || !second?.teamIds[0]) {
      return res.status(400).json({ error: 'Não há duplas suficientes para gerar a final' })
    }

    // Semi 1: 1st vs 4th (or final directly if only 2 teams with players)
    // Final: winners of semis
    const finalM = await prisma.match.create({
      data: { tournamentId: req.params.id, category: cat, round: 'final', position: 100, status: 'waiting' },
    })
    const thirdM = await prisma.match.create({
      data: { tournamentId: req.params.id, category: cat, round: 'terceiro lugar', position: 101, status: 'waiting' },
    })

    if (third?.teamIds[0] && fourth?.teamIds[0]) {
      // 4-team bracket: two semis
      const semi1 = await prisma.match.create({
        data: { teamAId: rep(first), teamBId: rep(fourth), tournamentId: req.params.id, category: cat, round: 'semi', position: 97, status: 'waiting', nextMatchId: finalM.id },
      })
      const semi2 = await prisma.match.create({
        data: { teamAId: rep(second), teamBId: rep(third), tournamentId: req.params.id, category: cat, round: 'semi', position: 98, status: 'waiting', nextMatchId: finalM.id },
      })
    } else {
      // 2-team final only
      await prisma.match.update({
        where: { id: finalM.id },
        data:  { teamAId: rep(first), teamBId: rep(second) },
      })
    }

    res.status(201).json(await getTournament(req.params.id))
  } catch (err) { next(err) }
})

// ── helpers ─────────────────────────────────────────────────────
async function getTournament(id) {
  return prisma.tournament.findUnique({ where: { id }, include: tInclude })
}

/**
 * Creates: semi1 → final, semi2 → final
 * Returns winner progression via nextMatchId.
 */
async function buildSemiFinal(tournamentId, category, semis) {
  const finalMatch = await prisma.match.create({
    data: { tournamentId, category, round: 'final', position: 3, status: 'waiting' },
  })
  await prisma.match.create({
    data: { teamAId: semis[0].a, teamBId: semis[0].b, tournamentId, category, round: 'semi', position: 1, status: 'waiting', nextMatchId: finalMatch.id },
  })
  await prisma.match.create({
    data: { teamAId: semis[1].a, teamBId: semis[1].b, tournamentId, category, round: 'semi', position: 2, status: 'waiting', nextMatchId: finalMatch.id },
  })
}

/**
 * Creates: qA → semi1, qB → semi1, qC → semi2, qD → semi2, semi1 → final, semi2 → final
 */
async function buildQuarterFinal(tournamentId, category, quarters) {
  const finalMatch = await prisma.match.create({
    data: { tournamentId, category, round: 'final', position: 7, status: 'waiting' },
  })
  const semi1 = await prisma.match.create({
    data: { tournamentId, category, round: 'semi', position: 5, status: 'waiting', nextMatchId: finalMatch.id },
  })
  const semi2 = await prisma.match.create({
    data: { tournamentId, category, round: 'semi', position: 6, status: 'waiting', nextMatchId: finalMatch.id },
  })
  await prisma.match.create({
    data: { teamAId: quarters[0].a, teamBId: quarters[0].b, tournamentId, category, round: 'quartas', position: 1, status: 'waiting', nextMatchId: semi1.id },
  })
  await prisma.match.create({
    data: { teamAId: quarters[1].a, teamBId: quarters[1].b, tournamentId, category, round: 'quartas', position: 2, status: 'waiting', nextMatchId: semi1.id },
  })
  await prisma.match.create({
    data: { teamAId: quarters[2].a, teamBId: quarters[2].b, tournamentId, category, round: 'quartas', position: 3, status: 'waiting', nextMatchId: semi2.id },
  })
  await prisma.match.create({
    data: { teamAId: quarters[3].a, teamBId: quarters[3].b, tournamentId, category, round: 'quartas', position: 4, status: 'waiting', nextMatchId: semi2.id },
  })
}

/**
 * 3-group bracket: top 2 (by saldo) get a bye into the semis.
 * The other 4 play quarterfinals; winners advance to face the bye teams.
 * Constraint: no team plays someone from their own group in the quarters.
 * Preference: stronger seed faces weakest valid opponent (best saldo vs worst saldo).
 */
async function buildThreeGroupBracket(tournamentId, category, ranked6) {
  const [bye0, bye1, a, b, c, d] = ranked6
  // a=seed3(best), b=seed4, c=seed5, d=seed6(worst) — all need to play quarters

  const sg = (x, y) => x.groupName === y.groupName

  // Find best valid pairing: prefer seed3 vs seed6 (strongest vs weakest)
  let qf1a, qf1b, qf2a, qf2b
  if (!sg(a, d) && !sg(b, c)) {
    // Ideal: seed3 vs seed6, seed4 vs seed5
    ;[qf1a, qf1b, qf2a, qf2b] = [a, d, b, c]
  } else if (!sg(a, c) && !sg(b, d)) {
    // Swap: seed3 vs seed5, seed4 vs seed6
    ;[qf1a, qf1b, qf2a, qf2b] = [a, c, b, d]
  } else {
    // Last resort (same group conflict unavoidable)
    ;[qf1a, qf1b, qf2a, qf2b] = [a, b, c, d]
  }

  const finalMatch = await prisma.match.create({
    data: { tournamentId, category, round: 'final', position: 5, status: 'waiting' },
  })
  const semi1 = await prisma.match.create({
    data: { teamAId: bye0.teamId, tournamentId, category, round: 'semi', position: 3, status: 'waiting', nextMatchId: finalMatch.id },
  })
  const semi2 = await prisma.match.create({
    data: { teamAId: bye1.teamId, tournamentId, category, round: 'semi', position: 4, status: 'waiting', nextMatchId: finalMatch.id },
  })
  await prisma.match.create({
    data: { teamAId: qf1a.teamId, teamBId: qf1b.teamId, tournamentId, category, round: 'quartas', position: 1, status: 'waiting', nextMatchId: semi1.id },
  })
  await prisma.match.create({
    data: { teamAId: qf2a.teamId, teamBId: qf2b.teamId, tournamentId, category, round: 'quartas', position: 2, status: 'waiting', nextMatchId: semi2.id },
  })
}

/**
 * Round-robin standings: sorted by P → saldo → GP → V
 */
function calcStandings(entries, matches) {
  const s = new Map()
  for (const e of entries) {
    s.set(e.teamId, { teamId: e.teamId, team: e.team, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, P: 0 })
  }
  for (const m of matches) {
    if (m.status !== 'finished') continue
    const a = s.get(m.teamAId), b = s.get(m.teamBId)
    if (!a || !b) continue
    a.J++; b.J++
    a.GP += m.scoreA; a.GC += m.scoreB
    b.GP += m.scoreB; b.GC += m.scoreA
    if (m.scoreA > m.scoreB)      { a.V++; a.P += 3; b.D++ }
    else if (m.scoreA < m.scoreB) { b.V++; b.P += 3; a.D++ }
    else                          { a.E++; a.P++;     b.E++; b.P++ }
  }
  return [...s.values()]
    .map(x => ({ ...x, S: x.GP - x.GC }))
    .sort((a, b) => b.P - a.P || b.S - a.S || b.GP - a.GP || b.V - a.V)
}

/**
 * Classic circle-method round-robin scheduler.
 */
function generateRoundRobin(teamIds) {
  const teams = [...teamIds]
  if (teams.length % 2 !== 0) teams.push(null)

  const total    = teams.length
  const fixed    = teams[0]
  const rotating = teams.slice(1)
  const schedule = []

  for (let r = 0; r < total - 1; r++) {
    const current = [fixed, ...rotating]
    const pairs   = []

    for (let i = 0; i < total / 2; i++) {
      const a = current[i]
      const b = current[total - 1 - i]
      if (a !== null && b !== null) pairs.push({ teamAId: a, teamBId: b })
    }

    schedule.push({ round: r + 1, pairs })
    rotating.unshift(rotating.pop())
  }

  return schedule
}

module.exports = router
