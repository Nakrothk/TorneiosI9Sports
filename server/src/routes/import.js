const express = require('express')
const multer  = require('multer')
const XLSX    = require('xlsx')
const prisma  = require('../lib/prisma')

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// ── Column alias map ────────────────────────────────────────────
// Key   = header normalized (no accents, lowercase, no spaces/symbols)
// Value = internal field name used in processing logic
const ALIASES = {
  // round / fase
  round: 'round', fase: 'round', rodada: 'round', etapa: 'round',
  phase: 'round', chave: 'round', roundfase: 'round', faseroundrodada: 'round',
  // position / jogo
  position: 'position', posicao: 'position', pos: 'position',
  jogo: 'position', jogonumero: 'position', numerodojogo: 'position',
  ordem: 'position', num: 'position', numero: 'position', id: 'position',
  matchid: 'position', matchnum: 'position',
  // teamA
  teama: 'teamA', duplaa: 'teamA', timea: 'teamA', equipea: 'teamA',
  jogadoresduplaA: 'teamA', duplaajogadores: 'teamA',
  // teamB
  teamb: 'teamB', duplab: 'teamB', timeb: 'teamB', equipeb: 'teamB',
  jogadoresDuplab: 'teamB', duplaBjogadores: 'teamB',
  // teamA sub-columns
  teama_player1: 'teamA_player1', jogador1a: 'teamA_player1', player1a: 'teamA_player1',
  teama_player2: 'teamA_player2', jogador2a: 'teamA_player2', player2a: 'teamA_player2',
  // teamB sub-columns
  teamb_player1: 'teamB_player1', jogador1b: 'teamB_player1', player1b: 'teamB_player1',
  teamb_player2: 'teamB_player2', jogador2b: 'teamB_player2', player2b: 'teamB_player2',
  // court / quadra
  court: 'court', quadra: 'court', campo: 'court', arena: 'court',
  // category / categoria
  category: 'category', categoria: 'category', cat: 'category',
  modalidade: 'category', divisao: 'category', nivel: 'category',
  // nextMatch
  nextmatch: 'nextMatch', next: 'nextMatch', proximo: 'nextMatch',
  proximojogo: 'nextMatch', proximapartida: 'nextMatch', avanca: 'nextMatch',
  avancapara: 'nextMatch', nextmatchposition: 'nextMatch', proximoId: 'nextMatch',
}

/** Remove accents, lowercase, strip non-alphanumeric → stable lookup key */
function normalizeKey(raw) {
  return String(raw)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Map a raw Excel header to our internal field name (or keep original) */
function mapHeader(raw) {
  return ALIASES[normalizeKey(raw)] ?? raw
}

/** Re-key every row using the mapped headers */
function remapRows(rows) {
  return rows.map(row => {
    const out = {}
    for (const [k, v] of Object.entries(row)) out[mapHeader(k)] = v
    return out
  })
}

// ── GET /import/template ────────────────────────────────────────
router.get('/template', (_req, res) => {
  const wb = XLSX.utils.book_new()

  const rows = [
    // Headers use the canonical English names — also accepted in PT (see ALIASES above)
    ['teamA', 'teamB', 'court', 'category', 'round', 'position', 'nextMatch'],
    ['João Silva / Pedro Costa',       'Rafael Nunes / Bruno Ferreira',  'Quadra 1', 'Misto A', 'quartas', 1, 5],
    ['Carlos Rocha / Lucas Mendes',    'Marcos Lima / Diego Santos',     'Quadra 2', 'Misto A', 'quartas', 2, 5],
    ['Fernanda Dias / Beatriz Alves',  'Camila Torres / Juliana Pinto',  'Quadra 1', 'Misto A', 'quartas', 3, 6],
    ['Maria Santos / Ana Lima',        'Paula Oliveira / Sandra Costa',  'Quadra 2', 'Misto A', 'quartas', 4, 6],
    ['', '', 'Quadra 1', 'Misto A', 'semi',   5, 7],
    ['', '', 'Quadra 2', 'Misto A', 'semi',   6, 7],
    ['', '', 'Quadra 1', 'Misto A', 'final',  7, ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 36 }, { wch: 36 }, { wch: 12 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'MATCHES')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="template-torneio.xlsx"')
  res.send(buf)
})

// ── POST /import ────────────────────────────────────────────────
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo Excel é obrigatório' })

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames.includes('MATCHES')
      ? 'MATCHES'
      : workbook.SheetNames[0]

    const sheet = workbook.Sheets[sheetName]

    // Read raw header row to report back to the user
    const [rawHeaders = []] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    const columnMap = {}  // originalName → mappedName
    for (const h of rawHeaders) {
      if (h !== '') columnMap[String(h)] = mapHeader(String(h))
    }

    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'Planilha vazia', columnMap })
    }

    const rows = remapRows(rawRows)

    // Warn if key columns weren't found after mapping
    const requiredMapped = new Set(Object.values(columnMap))
    const missing = []
    if (!requiredMapped.has('round'))    missing.push('round / fase / rodada')
    if (!requiredMapped.has('position')) missing.push('position / jogo / num')
    if (!requiredMapped.has('teamA'))    missing.push('teamA / dupla a / time a')
    if (!requiredMapped.has('teamB'))    missing.push('teamB / dupla b / time b')

    if (missing.length > 0) {
      return res.status(400).json({
        error:     'Colunas obrigatórias não encontradas na planilha',
        missing,
        columnMap,
        hint:      'Renomeie as colunas do Excel para os nomes listados abaixo, ou use o template disponível para download.',
        acceptedNames: {
          round:    'round | fase | rodada | etapa | chave',
          position: 'position | jogo | num | numero | ordem | id',
          teamA:    'teamA | dupla a | duplaa | time a | equipe a',
          teamB:    'teamB | dupla b | duplab | time b | equipe b',
          court:    'court | quadra | campo  (opcional)',
          category: 'category | categoria | modalidade  (opcional)',
          nextMatch:'nextMatch | proximo | proximojogo | avanca  (opcional)',
        },
      })
    }

    const matchMap  = {}   // position (number) → match.id
    const rowErrors = []

    // ── Pass 1: create all matches ──────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i]
      const rowNum = i + 2

      try {
        const round     = String(row.round    ?? '').trim()
        const rawPos    = row.position
        const position  = typeof rawPos === 'number' ? rawPos : parseInt(String(rawPos))
        const category  = String(row.category ?? '').trim()
        const courtName = String(row.court    ?? '').trim()

        if (!round)         { rowErrors.push(`Linha ${rowNum}: 'round/fase' está vazio`);         continue }
        if (isNaN(position)){ rowErrors.push(`Linha ${rowNum}: 'position/jogo' não é um número`); continue }
        if (matchMap[position]) { rowErrors.push(`Linha ${rowNum}: position ${position} duplicado`); continue }

        // Court — find or create
        let courtId = null
        if (courtName) {
          let court = await prisma.court.findFirst({ where: { name: courtName } })
          if (!court) court = await prisma.court.create({ data: { name: courtName } })
          courtId = court.id
        }

        // Teams — both are optional (TBD slots for later rounds)
        const teamAId = await resolveTeam(row.teamA, row.teamA_player1, row.teamA_player2)
        const teamBId = await resolveTeam(row.teamB, row.teamB_player1, row.teamB_player2)

        const match = await prisma.match.create({
          data: { teamAId, teamBId, courtId, category, round, position, status: 'waiting' },
        })
        matchMap[position] = match.id
      } catch (err) {
        rowErrors.push(`Linha ${rowNum}: ${err.message}`)
      }
    }

    // ── Pass 2: link nextMatchId ────────────────────────────────
    for (const row of rows) {
      const pos     = typeof row.position  === 'number' ? row.position  : parseInt(String(row.position  ?? ''))
      const nextPos = typeof row.nextMatch === 'number' ? row.nextMatch : parseInt(String(row.nextMatch ?? ''))
      if (!isNaN(pos) && !isNaN(nextPos) && nextPos && matchMap[pos] && matchMap[nextPos]) {
        await prisma.match.update({
          where: { id: matchMap[pos] },
          data:  { nextMatchId: matchMap[nextPos] },
        })
      }
    }

    res.json({
      imported:  Object.keys(matchMap).length,
      total:     rows.length,
      columnMap,
      errors:    rowErrors.length ? rowErrors : undefined,
    })
  } catch (err) {
    next(err)
  }
})

// ── helpers ─────────────────────────────────────────────────────
async function resolveTeam(combined, p1Field, p2Field) {
  let p1 = String(p1Field ?? '').trim()
  let p2 = String(p2Field ?? '').trim()

  if (!p1 && !p2) {
    const s = String(combined ?? '').trim()
    if (s.includes('/')) {
      const parts = s.split('/').map(x => x.trim())
      p1 = parts[0] ?? ''
      p2 = parts[1] ?? ''
    }
  }

  if (!p1 || !p2) return null

  let team = await prisma.team.findFirst({ where: { player1: p1, player2: p2 } })
  if (!team) team = await prisma.team.create({ data: { player1: p1, player2: p2 } })
  return team.id
}

module.exports = router
