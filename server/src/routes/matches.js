const express = require('express')
const prisma  = require('../lib/prisma')

const router  = express.Router()
const include = { teamA: true, teamB: true, court: true, winnerTeam: true }

// ── GET /matches ────────────────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const matches = await prisma.match.findMany({
      include,
      orderBy: [{ round: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
    })
    res.json(matches)
  } catch (err) { next(err) }
})

// ── GET /matches/active ─────────────────────────────────────────
router.get('/active', async (_req, res, next) => {
  try {
    const matches = await prisma.match.findMany({
      where:   { status: 'playing' },
      include,
      orderBy: { createdAt: 'asc' },
    })
    res.json(matches)
  } catch (err) { next(err) }
})

// ── GET /matches/current ────────────────────────────────────────
router.get('/current', async (_req, res, next) => {
  try {
    const match = await prisma.match.findFirst({
      where:   { calledAt: { not: null } },
      orderBy: { calledAt: 'desc' },
      include,
    })
    res.json(match)
  } catch (err) { next(err) }
})

// ── GET /matches/tv ─────────────────────────────────────────────
// Returns { called, next } for the TV display.
// "called" only includes non-finished matches so finished games don't block the next display.
router.get('/tv', async (_req, res, next) => {
  try {
    const [called, next] = await Promise.all([
      prisma.match.findFirst({
        where:   { calledAt: { not: null }, status: { not: 'finished' } },
        orderBy: { calledAt: 'desc' },
        include,
      }),
      prisma.match.findFirst({ where: { isNext: true, calledAt: null }, include }),
    ])
    res.json({ called: called ?? null, next: next ?? null })
  } catch (err) { next(err) }
})

// ── POST /matches ───────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { teamAId, teamBId, courtId, category, round, position } = req.body
    if (!teamAId || !teamBId) {
      return res.status(400).json({ error: 'teamAId e teamBId são obrigatórios' })
    }
    if (teamAId === teamBId) {
      return res.status(400).json({ error: 'Dupla A e Dupla B devem ser diferentes' })
    }
    const match = await prisma.match.create({
      data: {
        teamAId, teamBId,
        courtId:  courtId  || null,
        category: category || '',
        round:    round    || '',
        position: position ? parseInt(position) : 0,
        status:   'waiting',
      },
      include,
    })
    res.status(201).json(match)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/call ──────────────────────────────────────
router.post('/:id/call', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' })
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data:  { calledAt: new Date(), isNext: false },
      include,
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/start ─────────────────────────────────────
router.post('/:id/start', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' })
    if (match.status !== 'waiting') {
      return res.status(400).json({ error: 'Partida não está em espera' })
    }
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data:  { status: 'playing', isNext: false },
      include,
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/finish ────────────────────────────────────
// Accepts optional { scoreA, scoreB } to set final score directly.
// Determines winner and auto-advances them to the next bracket slot.
router.post('/:id/finish', async (req, res, next) => {
  try {
    const current = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!current) return res.status(404).json({ error: 'Partida não encontrada' })
    if (current.status === 'finished') {
      return res.status(400).json({ error: 'Partida já foi finalizada' })
    }

    const finalScoreA = req.body.scoreA !== undefined ? parseInt(req.body.scoreA) : current.scoreA
    const finalScoreB = req.body.scoreB !== undefined ? parseInt(req.body.scoreB) : current.scoreB

    let winnerTeamId = null
    if      (finalScoreA > finalScoreB) winnerTeamId = current.teamAId
    else if (finalScoreB > finalScoreA) winnerTeamId = current.teamBId

    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data:  { status: 'finished', scoreA: finalScoreA, scoreB: finalScoreB, winnerTeamId },
      include,
    })

    // ── Bracket progression ─────────────────────────────────────
    if (winnerTeamId && current.nextMatchId) {
      const next = await prisma.match.findUnique({ where: { id: current.nextMatchId } })
      if (next && next.status !== 'finished') {
        if      (!next.teamAId) await prisma.match.update({ where: { id: next.id }, data: { teamAId: winnerTeamId } })
        else if (!next.teamBId) await prisma.match.update({ where: { id: next.id }, data: { teamBId: winnerTeamId } })
      }
    }

    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/score ─────────────────────────────────────
router.post('/:id/score', async (req, res, next) => {
  try {
    const { team } = req.body
    if (team !== 'A' && team !== 'B') {
      return res.status(400).json({ error: 'team deve ser "A" ou "B"' })
    }
    const current = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!current) return res.status(404).json({ error: 'Partida não encontrada' })
    if (current.status !== 'playing') {
      return res.status(400).json({ error: 'Partida não está em andamento' })
    }

    const data = team === 'A'
      ? { prevScoreA: current.scoreA, prevScoreB: current.scoreB, scoreA: current.scoreA + 1 }
      : { prevScoreA: current.scoreA, prevScoreB: current.scoreB, scoreB: current.scoreB + 1 }

    const updated = await prisma.match.update({ where: { id: req.params.id }, data, include })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/undo ──────────────────────────────────────
router.post('/:id/undo', async (req, res, next) => {
  try {
    const current = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!current) return res.status(404).json({ error: 'Partida não encontrada' })
    if (current.status !== 'playing') {
      return res.status(400).json({ error: 'Partida não está em andamento' })
    }
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data:  { scoreA: current.prevScoreA, scoreB: current.prevScoreB },
      include,
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/mark-next ────────────────────────────────
// Marca esta partida como "próxima a ser chamada" (toggle).
// Só uma partida pode ser "próxima" por vez — limpa as demais.
router.post('/:id/mark-next', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' })

    const newValue = !match.isNext
    await prisma.match.updateMany({ data: { isNext: false } })
    if (newValue) {
      await prisma.match.update({ where: { id: req.params.id }, data: { isNext: true } })
    }

    const updated = await prisma.match.findUnique({ where: { id: req.params.id }, include })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/court ─────────────────────────────────────
router.post('/:id/court', async (req, res, next) => {
  try {
    const { courtId } = req.body
    const current = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!current) return res.status(404).json({ error: 'Partida não encontrada' })
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data:  { courtId: courtId || null },
      include,
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/edit ──────────────────────────────────────
// Corrige o resultado de uma partida já finalizada (ou em qualquer status).
router.post('/:id/edit', async (req, res, next) => {
  try {
    const { scoreA, scoreB } = req.body
    if (scoreA === undefined || scoreB === undefined) {
      return res.status(400).json({ error: 'scoreA e scoreB são obrigatórios' })
    }
    const current = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!current) return res.status(404).json({ error: 'Partida não encontrada' })

    const fA = parseInt(scoreA)
    const fB = parseInt(scoreB)
    let winnerTeamId = null
    if (fA > fB)      winnerTeamId = current.teamAId
    else if (fB > fA) winnerTeamId = current.teamBId

    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data:  { scoreA: fA, scoreB: fB, winnerTeamId, status: 'finished' },
      include,
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/set-teams ────────────────────────────────
router.post('/:id/set-teams', async (req, res, next) => {
  try {
    const { teamAId, teamBId } = req.body
    const data = {}
    if (teamAId !== undefined) data.teamAId = teamAId || null
    if (teamBId !== undefined) data.teamBId = teamBId || null
    const updated = await prisma.match.update({ where: { id: req.params.id }, data, include })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── POST /matches/:id/set-time ─────────────────────────────────
router.post('/:id/set-time', async (req, res, next) => {
  try {
    const { scheduledTime } = req.body
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data:  { scheduledTime: scheduledTime || '' },
      include,
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── PUT /matches/:id/position ──────────────────────────────────
router.put('/:id/position', async (req, res, next) => {
  try {
    const pos = parseInt(req.body.position)
    if (isNaN(pos)) return res.status(400).json({ error: 'position deve ser um número' })
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data:  { position: pos },
      include,
    })
    res.json(updated)
  } catch (err) { next(err) }
})

module.exports = router
