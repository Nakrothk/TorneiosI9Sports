const express = require('express')
const multer  = require('multer')
const XLSX    = require('xlsx')
const prisma  = require('../lib/prisma')

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

const TEAM_CATEGORIES = [
  'Masculina A', 'Masculina B', 'Masculina C', 'Masculina D', 'Masculina E',
  'Feminina A',  'Feminina B',  'Feminina C',  'Feminina D',  'Feminina E',
  'Mista A',     'Mista B',     'Mista C',     'Mista D',     'Mista E',
]

function normalizeCategory(raw) {
  const s = String(raw ?? '').trim()
  const found = TEAM_CATEGORIES.find(c => c.toLowerCase() === s.toLowerCase())
  return found ?? s
}

router.get('/', async (_req, res, next) => {
  try {
    const teams = await prisma.team.findMany({ orderBy: { player1: 'asc' } })
    res.json(teams)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { player1, player2, category } = req.body
    if (!player1?.trim() || !player2?.trim()) {
      return res.status(400).json({ error: 'player1 e player2 são obrigatórios' })
    }
    if (!category?.trim()) {
      return res.status(400).json({ error: 'category é obrigatória' })
    }
    const team = await prisma.team.create({
      data: { player1: player1.trim(), player2: player2.trim(), category: category.trim() },
    })
    res.status(201).json(team)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { player1, player2, category } = req.body
    const data = {}
    if (player1?.trim()) data.player1 = player1.trim()
    if (player2?.trim()) data.player2 = player2.trim()
    if (category?.trim()) data.category = category.trim()
    const team = await prisma.team.update({ where: { id: req.params.id }, data })
    res.json(team)
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.team.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /teams/export ───────────────────────────────────────────
router.get('/export', async (_req, res, next) => {
  try {
    const teams = await prisma.team.findMany({ orderBy: [{ category: 'asc' }, { player1: 'asc' }] })
    const rows = [['Jogador 1', 'Jogador 2', 'Categoria']]
    for (const t of teams) rows.push([t.player1, t.player2, t.category || ''])

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws, 'DUPLAS')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="duplas.xlsx"')
    res.send(buf)
  } catch (err) { next(err) }
})

// ── POST /teams/import ──────────────────────────────────────────
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo é obrigatório' })

    const wb    = XLSX.read(req.file.buffer, { type: 'buffer' })
    const ws    = wb.Sheets[wb.SheetNames[0]]
    const rows  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // Skip header row if first cell looks like a label
    const start = String(rows[0]?.[0] ?? '').toLowerCase().includes('jogador') ? 1 : 0

    let imported = 0, skipped = 0
    const errors = []

    for (let i = start; i < rows.length; i++) {
      const [p1raw, p2raw, catRaw] = rows[i]
      const p1  = String(p1raw  ?? '').trim()
      const p2  = String(p2raw  ?? '').trim()
      const cat = normalizeCategory(catRaw)

      if (!p1 || !p2) { skipped++; continue }
      if (!cat)       { errors.push(`Linha ${i + 1}: categoria vazia`); continue }

      const existing = await prisma.team.findFirst({ where: { player1: p1, player2: p2 } })
      if (existing) {
        await prisma.team.update({ where: { id: existing.id }, data: { category: cat } })
      } else {
        await prisma.team.create({ data: { player1: p1, player2: p2, category: cat } })
      }
      imported++
    }

    res.json({ imported, skipped, errors: errors.length ? errors : undefined })
  } catch (err) { next(err) }
})

module.exports = router
