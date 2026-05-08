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
    const { name, category, group } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' })
    const t = await prisma.tournament.create({
      data: { name: name.trim(), category: category?.trim() || '', group: group?.trim() || '' },
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
    const { teamId } = req.body
    if (!teamId) return res.status(400).json({ error: 'teamId é obrigatório' })

    const exists = await prisma.tournamentEntry.findFirst({
      where: { tournamentId: req.params.id, teamId },
    })
    if (exists) return res.status(400).json({ error: 'Dupla já está neste torneio' })

    const count = await prisma.tournamentEntry.count({ where: { tournamentId: req.params.id } })
    await prisma.tournamentEntry.create({
      data: { tournamentId: req.params.id, teamId, seed: count + 1 },
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
