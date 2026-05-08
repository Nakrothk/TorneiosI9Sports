const express = require('express')
const prisma = require('../lib/prisma')

const router = express.Router()

router.get('/', async (_req, res, next) => {
  try {
    const courts = await prisma.court.findMany({ orderBy: { name: 'asc' } })
    res.json(courts)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' })
    const court = await prisma.court.create({ data: { name: name.trim() } })
    res.status(201).json(court)
  } catch (err) { next(err) }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' })
    const court = await prisma.court.update({ where: { id: req.params.id }, data: { name: name.trim() } })
    res.json(court)
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.court.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

module.exports = router
