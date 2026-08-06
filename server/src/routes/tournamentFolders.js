const express = require('express')
const prisma  = require('../lib/prisma')

const router = express.Router()

// ── GET /tournament-folders ─────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const folders = await prisma.tournamentFolder.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { tournaments: true } } },
    })
    res.json(folders)
  } catch (err) { next(err) }
})

// ── POST /tournament-folders ────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' })
    const folder = await prisma.tournamentFolder.create({ data: { name: name.trim() } })
    res.status(201).json(folder)
  } catch (err) { next(err) }
})

// ── DELETE /tournament-folders/:id ──────────────────────────────
// Só permite excluir pastas vazias, pra não perder torneio arquivado por engano.
router.delete('/:id', async (req, res, next) => {
  try {
    const count = await prisma.tournament.count({ where: { folderId: req.params.id } })
    if (count > 0) return res.status(400).json({ error: 'Só é possível excluir pastas vazias' })
    await prisma.tournamentFolder.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

module.exports = router
