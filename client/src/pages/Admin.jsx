import { useState, useEffect, useCallback, useRef } from 'react'
import { api, API_BASE } from '../api'

const API_URL = API_BASE

function authFetch(url, options = {}) {
  const token = localStorage.getItem('auth_token')
  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

// ── constants ────────────────────────────────────────────────────
const TEAM_CATEGORIES = [
  'Masculina A', 'Masculina B', 'Masculina C', 'Masculina D', 'Masculina E',
  'Feminina A',  'Feminina B',  'Feminina C',  'Feminina D',  'Feminina E',
  'Mista A',     'Mista B',     'Mista C',     'Mista D',     'Mista E',
  'MÃE + MÃE', 'MÃES + FILHOS(AS)', 'MÃE E FILHOS', 'MÃES + FILHAS',
]
const CATEGORIES = TEAM_CATEGORIES

function teamCatStyle(cat) {
  if (!cat) return 'bg-gray-100 text-gray-500'
  const l = cat.toLowerCase()
  if (l.startsWith('masculin')) return 'bg-blue-100 text-blue-700'
  if (l.startsWith('feminin'))  return 'bg-pink-100 text-pink-700'
  return 'bg-purple-100 text-purple-700'
}

function catLeftColor(cat) {
  if (!cat) return '#e5e7eb'
  const l = cat.toLowerCase()
  if (l.startsWith('masculin')) return '#60a5fa' // blue-400
  if (l.startsWith('feminin'))  return '#f472b6' // pink-400
  if (l.startsWith('mist'))     return '#fbbf24' // amber-400
  return '#c084fc' // purple-400
}

function catTagStyle(cat) {
  if (!cat) return 'bg-gray-100 text-gray-500'
  const l = cat.toLowerCase()
  if (l.startsWith('masculin')) return 'bg-blue-100 text-blue-700'
  if (l.startsWith('feminin'))  return 'bg-pink-100 text-pink-700'
  if (l.startsWith('mist'))     return 'bg-amber-100 text-amber-700'
  return 'bg-purple-100 text-purple-700'
}
// Parses "Sáb 09:30" → { day: 'Sáb', time: '09:30' } or "09:30" → { day: '', time: '09:30' }
function parseST(st) {
  if (!st) return { day: '', time: '' }
  const s = st.trim()
  if (s.startsWith('Sáb ') || s.startsWith('Dom ')) return { day: s.slice(0, 3), time: s.slice(4) }
  return { day: '', time: s }
}
function stDayOrder(st) { return st?.startsWith('Dom') ? 1 : 0 }

const ROUND_ORDER  = ['oitavas', 'quartas', 'semi', 'final', 'terceiro lugar']
const ROUND_LABELS = {
  oitavas:          'Oitavas de Final',
  quartas:          'Quartas de Final',
  semi:             'Semifinal',
  final:            'Final',
  'terceiro lugar': 'Disputa 3° Lugar',
}
const STATUS_STYLE = {
  waiting:  { label: 'Aguardando', bg: 'bg-yellow-100 text-yellow-800', border: 'border-l-yellow-400' },
  playing:  { label: 'Em Jogo',    bg: 'bg-green-100 text-green-800',   border: 'border-l-green-500'  },
  finished: { label: 'Finalizada', bg: 'bg-gray-100 text-gray-500',     border: 'border-l-gray-300'   },
}

// ── helpers ──────────────────────────────────────────────────────
const teamName = (t) => t ? `${t.player1} / ${t.player2}` : 'A definir'

function printEvent(ev) {
  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

  const matchRow = (m) => {
    const nA = m.teamA ? esc(`${m.teamA.player1} / ${m.teamA.player2}`) : 'A definir'
    const nB = m.teamB ? esc(`${m.teamB.player1} / ${m.teamB.player2}`) : 'A definir'
    const wA = m.winnerTeamId && m.winnerTeamId === m.teamAId
    const wB = m.winnerTeamId && m.winnerTeamId === m.teamBId
    const score = m.status === 'finished' ? `${m.scoreA} × ${m.scoreB}` : `—`
    const { day: stDay, time: stTime } = parseST(m.scheduledTime)
    const timeContent = stDay || stTime ? `${stDay ? `<span class="dy">${esc(stDay)}</span> ` : ''}${esc(stTime)}` : ''
    return `<tr>
      <td class="tm">${timeContent}</td>
      <td class="ta ${wA ? 'win' : ''}">${wA ? '🏆 ' : ''}${nA}</td>
      <td class="sc ${m.status === 'finished' ? 'done' : ''}">${score}</td>
      <td class="tb ${wB ? 'win' : ''}">${wB ? '🏆 ' : ''}${nB}</td>
    </tr>`
  }

  const groupCols = ev.groups.length <= 2 ? 2 : ev.groups.length <= 4 ? 2 : 3

  const groupsHTML = ev.groups.length > 0 ? `
    <div class="groups" style="grid-template-columns:repeat(${groupCols},1fr)">
      ${ev.groups.map(t => {
        const sorted = [...t.matches].sort((a,b) => (a.position||0)-(b.position||0))
        return `<div class="box">
          <div class="box-hd">Grupo ${esc(t.group)}</div>
          <table>${sorted.map(matchRow).join('')}</table>
        </div>`
      }).join('')}
    </div>` : ''

  // ── Standalone matches (no group label, no separate bracket tournament) ──
  const standaloneHTML = ev.standalone ? (() => {
    const rounds = groupByRound(ev.standalone.matches)
    const hasRounds = rounds.some(r => r.round)
    if (hasRounds) {
      return `<div class="bracket-wrap">
        <div class="section-title">${esc(ev.standalone.name || ev.name)}</div>
        <div class="groups" style="grid-template-columns:repeat(${rounds.length || 1},1fr)">
          ${rounds.map(({ round, matches }) => `
            <div class="box">
              <div class="box-hd">${esc((ROUND_LABELS[round?.toLowerCase()] ?? round) || 'Partidas')}</div>
              <table>${[...matches].sort((a, b) => (a.position||0) - (b.position||0)).map(matchRow).join('')}</table>
            </div>`).join('')}
        </div>
      </div>`
    }
    const sorted = [...ev.standalone.matches].sort((a, b) => (a.position||0) - (b.position||0))
    return `<div class="groups" style="grid-template-columns:1fr">
      <div class="box">
        <div class="box-hd">${esc(ev.standalone.name || ev.name)}</div>
        <table>${sorted.map(matchRow).join('')}</table>
      </div>
    </div>`
  })() : ''

  // ── Previsão Final ────────────────────────────────────────────
  const buildStandings = (matchList) => {
    const tm = {}
    for (const m of matchList) {
      if (m.status !== 'finished') continue
      if (m.teamA && !tm[m.teamAId]) tm[m.teamAId] = { team: m.teamA, wins: 0 }
      if (m.teamB && !tm[m.teamBId]) tm[m.teamBId] = { team: m.teamB, wins: 0 }
      if (m.winnerTeamId === m.teamAId && tm[m.teamAId]) tm[m.teamAId].wins++
      if (m.winnerTeamId === m.teamBId && tm[m.teamBId]) tm[m.teamBId].wins++
    }
    return Object.values(tm).sort((a, b) => b.wins - a.wins)
  }

  let previewHTML = ''

  if (ev.groups.length >= 2) {
    const previewData = ev.groups.map(t => {
      const standings = buildStandings(t.matches)
      return { group: t.group, leader: standings[0] || null, wins: standings[0]?.wins ?? 0 }
    })
    const previewPairs = []
    for (let i = 0; i < previewData.length; i += 2) previewPairs.push([previewData[i], previewData[i + 1] || null])
    const r1Label = previewPairs.length === 1 ? 'Final' : previewPairs.length === 2 ? 'Semifinal' : 'Quartas'
    if (previewData.some(g => g.leader)) {
      previewHTML = `
        <div class="bracket-wrap">
          <div class="section-title">Previsão Final</div>
          <div class="groups" style="grid-template-columns:1fr 1fr">
            <div class="box">
              <div class="box-hd">Líderes dos Grupos</div>
              <table>${previewData.map(g => `<tr>
                <td style="font-weight:700;color:#6d28d9;width:70px">Grupo ${esc(g.group)}</td>
                <td>${g.leader ? esc(`${g.leader.team.player1} / ${g.leader.team.player2}`) : '<em style="color:#aaa">Aguardando...</em>'}</td>
                <td style="color:#16a34a;font-weight:700;white-space:nowrap">${g.leader ? `${g.wins}V` : ''}</td>
              </tr>`).join('')}</table>
            </div>
            <div class="box" style="border-color:#7c3aed">
              <div class="box-hd" style="background:#7c3aed">${r1Label === 'Final' ? '🏆 Final Prevista' : r1Label}</div>
              <table>${previewPairs.map(([a, b]) => `<tr>
                <td style="text-align:right;font-weight:700;max-width:130px">${a.leader ? esc(`${a.leader.team.player1} / ${a.leader.team.player2}`) : `→ Grupo ${esc(a.group)}`}</td>
                <td style="text-align:center;font-weight:900;color:#7c3aed;padding:4px 10px">vs</td>
                <td style="font-weight:700;max-width:130px">${b ? (b.leader ? esc(`${b.leader.team.player1} / ${b.leader.team.player2}`) : `→ Grupo ${esc(b.group)}`) : '—'}</td>
              </tr>`).join('')}</table>
              ${previewPairs.length > 1 ? `<div style="background:#ede9fe;padding:5px 8px;font-size:10px;color:#6d28d9;font-weight:700;text-align:center">
                🏆 Final: Vencedor ${esc(previewPairs[0]?.[0]?.group ?? '')}/${esc(previewPairs[0]?.[1]?.group ?? '')} vs Vencedor ${esc(previewPairs[1]?.[0]?.group ?? '')}/${esc(previewPairs[1]?.[1]?.group ?? '')}
              </div>` : ''}
            </div>
          </div>
        </div>`
    }
  } else {
    // 1 group or standalone — show standings + predicted final (top 2)
    const allMatches = [
      ...ev.groups.flatMap(t => t.matches),
      ...(ev.standalone ? ev.standalone.matches : []),
    ]
    const standings = buildStandings(allMatches)
    if (standings.length >= 2) {
      const [top1, top2] = standings
      const tname = p => esc(`${p.team.player1} / ${p.team.player2}`)
      previewHTML = `
        <div class="bracket-wrap">
          <div class="section-title">Previsão Final</div>
          <div class="groups" style="grid-template-columns:1fr 1fr">
            <div class="box">
              <div class="box-hd">Melhores Desempenhos</div>
              <table>${standings.slice(0, 6).map((p, i) => `<tr>
                <td style="font-weight:700;color:#6d28d9;width:24px">${i + 1}°</td>
                <td>${tname(p)}</td>
                <td style="color:#16a34a;font-weight:700;white-space:nowrap">${p.wins}V</td>
              </tr>`).join('')}</table>
            </div>
            <div class="box" style="border-color:#7c3aed">
              <div class="box-hd" style="background:#7c3aed">🏆 Final Prevista</div>
              <table><tr>
                <td style="text-align:right;font-weight:700">${tname(top1)}</td>
                <td style="text-align:center;font-weight:900;color:#7c3aed;padding:4px 10px">vs</td>
                <td style="font-weight:700">${tname(top2)}</td>
              </tr></table>
            </div>
          </div>
        </div>`
    }
  }

  const bracketHTML2 = ev.bracket ? (() => {
    const rounds = groupByRound(ev.bracket.matches)
    return `<div class="bracket-wrap">
      <div class="section-title">🏆 Chave Final</div>
      <div class="groups" style="grid-template-columns:repeat(${rounds.length||1},1fr)">
        ${rounds.map(({ round, matches }) => `
          <div class="box">
            <div class="box-hd">${esc(ROUND_LABELS[round?.toLowerCase()] ?? round)}</div>
            <table>${[...matches].sort((a,b)=>(a.position||0)-(b.position||0)).map(matchRow).join('')}</table>
          </div>`).join('')}
      </div>
    </div>`
  })() : ''

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="utf-8">
  <title>${esc(ev.name)} — ${esc(ev.category)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:16px}
    h1{font-size:18px;font-weight:900;margin-bottom:2px}
    .cat{font-size:12px;color:#555;margin-bottom:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px}
    .groups{display:grid;gap:14px;margin-bottom:18px}
    .box{border:2px solid #222;border-radius:6px;overflow:hidden;break-inside:avoid}
    .box-hd{background:#1e293b;color:#fff;padding:5px 10px;font-weight:900;font-size:12px;text-transform:uppercase;letter-spacing:1px}
    table{width:100%;border-collapse:collapse}
    tr{border-bottom:1px solid #e5e7eb}
    tr:last-child{border-bottom:none}
    td{padding:5px 8px;font-size:10.5px}
    .tm{text-align:center;font-weight:700;color:#6b7280;white-space:nowrap;padding:5px 6px;font-size:10px;width:44px}
    .dy{color:#7c3aed;font-weight:900}
    .ta{text-align:right;color:#1d4ed8;max-width:140px}
    .tb{text-align:left;color:#dc2626;max-width:140px}
    .sc{text-align:center;font-weight:900;white-space:nowrap;padding:5px 12px;color:#374151}
    .done{color:#111}
    .win{font-weight:900}
    .section-title{font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;padding-bottom:4px;border-bottom:2px solid #1e293b}
    .bracket-wrap{margin-bottom:18px}
    @media print{@page{margin:1cm;size:A4}body{padding:0}}
  </style>
</head><body>
  <h1>${esc(ev.name)}</h1>
  ${ev.category ? `<p class="cat">${esc(ev.category)}</p>` : ''}
  ${groupsHTML}
  ${standaloneHTML}
  ${previewHTML}
  ${bracketHTML2}
  <script>window.onload=()=>{window.print()}<\/script>
</body></html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
}

function printAllMatches(matches) {
  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

  const catBorder = (cat) => {
    if (!cat) return '#e5e7eb'
    const l = cat.toLowerCase()
    if (l.startsWith('masculin')) return '#93c5fd'
    if (l.startsWith('feminin'))  return '#f9a8d4'
    if (l.startsWith('mist'))     return '#fcd34d'
    return '#c4b5fd'
  }

  const rows = matches.map(m => {
    const nA    = m.teamA ? esc(`${m.teamA.player1} / ${m.teamA.player2}`) : 'A definir'
    const nB    = m.teamB ? esc(`${m.teamB.player1} / ${m.teamB.player2}`) : 'A definir'
    const wA    = m.winnerTeamId && m.winnerTeamId === m.teamAId
    const wB    = m.winnerTeamId && m.winnerTeamId === m.teamBId
    const score = m.status === 'finished' ? `${m.scoreA} × ${m.scoreB}` : '—'
    const { day: stDay, time: stTime } = parseST(m.scheduledTime)
    const time  = (stDay || stTime) ? `<b>${stDay ? `<span style="color:#7c3aed">${esc(stDay)}</span> ` : ''}${esc(stTime)}</b>` : '<span style="color:#ccc">—</span>'
    const round = ROUND_LABELS[m.round?.toLowerCase()] || m.round || ''
    const parts = [m._category, m._group ? `Gr.${m._group}` : '', round].filter(Boolean)
    const ctx   = esc(parts.join(' · '))
    const bdr   = catBorder(m._category)
    return `<tr>
      <td class="tm" style="border-left:3px solid ${bdr}">${time}</td>
      <td class="ctx">${ctx}</td>
      <td class="ta ${wA ? 'win' : ''}">${wA ? '🏆 ' : ''}${nA}</td>
      <td class="sc ${m.status === 'finished' ? 'done' : ''}">${score}</td>
      <td class="tb ${wB ? 'win' : ''}">${wB ? '🏆 ' : ''}${nB}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="utf-8">
  <title>Todos os Jogos</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:16px}
    h1{font-size:16px;font-weight:900;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    tr{border-bottom:1px solid #e5e7eb}
    tr:last-child{border-bottom:none}
    td{padding:4px 7px;font-size:10.5px;vertical-align:middle}
    .tm{text-align:center;white-space:nowrap;width:42px;padding-left:8px}
    .ctx{font-size:9px;color:#6b7280;white-space:nowrap;max-width:110px}
    .ta{text-align:right;color:#1d4ed8;max-width:150px}
    .tb{text-align:left;color:#dc2626;max-width:150px}
    .sc{text-align:center;font-weight:900;white-space:nowrap;padding:4px 10px;color:#374151}
    .done{color:#111}
    .win{font-weight:900}
    @media print{@page{margin:1cm;size:A4}body{padding:0}}
  </style>
</head><body>
  <h1>📋 Todos os Jogos</h1>
  <table>${rows}</table>
  <script>window.onload=()=>{window.print()}<\/script>
</body></html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
}

function groupByRound(matches) {
  const g = {}
  for (const m of matches) {
    const k = m.round || ''
    if (!g[k]) g[k] = []
    g[k].push(m)
  }
  for (const arr of Object.values(g)) arr.sort((a, b) => a.position - b.position)
  return Object.keys(g).sort((a, b) => {
    const ia = ROUND_ORDER.indexOf(a.toLowerCase()), ib = ROUND_ORDER.indexOf(b.toLowerCase())
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  }).map(round => ({ round, matches: g[round] }))
}

function calcStandings(entries, matches) {
  const s = new Map()
  for (const e of entries) {
    s.set(e.teamId, { team: e.team, seed: e.seed, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, P: 0 })
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

function byeTeams(entries, roundMatches) {
  const playing = new Set(roundMatches.flatMap(m => [m.teamAId, m.teamBId]))
  return entries.filter(e => !playing.has(e.teamId))
}

// ════════════════════════════════════════════════════════════════
// Admin root
// ════════════════════════════════════════════════════════════════
export default function Admin() {
  const [tab, setTab] = useState('chaves')
  const [courts,      setCourts]      = useState([])
  const [teams,       setTeams]       = useState([])
  const [matches,     setMatches]     = useState([])
  const [tournaments, setTournaments] = useState([])
  const [toast, setToast] = useState(null)

  const [courtName, setCourtName] = useState('')
  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [pCat, setPCat] = useState('')
  const [mCourt, setMCourt] = useState(''); const [mTeamA, setMTeamA] = useState('')
  const [mTeamB, setMTeamB] = useState(''); const [mCategory, setMCategory] = useState('')
  const [importFile,   setImportFile]   = useState(null)
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    try {
      const [c, t, m, tr] = await Promise.all([
        api.get('/courts'), api.get('/teams'), api.get('/matches'), api.get('/tournaments'),
      ])
      setCourts(c); setTeams(t); setMatches(m); setTournaments(tr)
    } catch (err) { notify(err.message, 'err') }
  }, [])

  useEffect(() => { load() }, [load])

  const withReload = (fn) => async (...args) => {
    try { await fn(...args); await load() }
    catch (err) { notify(err.message, 'err') }
  }

  const createCourt = withReload(async (e) => {
    e.preventDefault(); await api.post('/courts', { name: courtName })
    setCourtName(''); notify('Quadra criada!')
  })
  const createTeam = withReload(async (e) => {
    e.preventDefault(); await api.post('/teams', { player1: p1, player2: p2, category: pCat })
    setP1(''); setP2(''); notify('Dupla criada!')
  })
  const createMatch = withReload(async (e) => {
    e.preventDefault()
    await api.post('/matches', { teamAId: mTeamA, teamBId: mTeamB, courtId: mCourt || undefined, category: mCategory || undefined })
    setMTeamA(''); setMTeamB(''); setMCourt(''); setMCategory(''); notify('Partida criada!')
  })
  const matchAction = withReload(async (id, action, body) => {
    await api.post(`/matches/${id}/${action}`, body)
    if (action === 'call') notify('📢 Chamada enviada para a TV!')
  })

  const handleImport = async () => {
    if (!importFile) return notify('Selecione um arquivo .xlsx', 'err')
    setImporting(true); setImportResult(null)
    try {
      const form = new FormData(); form.append('file', importFile)
      const res = await authFetch(`${API_URL}/import`, { method: 'POST', body: form })
      const data = await res.json()
      setImportResult({ ...data, ok: res.ok })
      if (!res.ok) notify(data.error || `Erro HTTP ${res.status}`, 'err')
      else { notify(`✅ ${data.imported} de ${data.total} partidas importadas!`); await load() }
    } catch (err) { notify(err.message, 'err') }
    finally { setImporting(false); setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const standaloneMaches = matches.filter(m => !m.tournamentId)
  const hasBracket = standaloneMaches.some(m => m.round)
  const grouped = hasBracket ? groupByRound(standaloneMaches) : [{ round: '', matches: standaloneMaches }]

  const TABS = [
    { id: 'chaves',   label: 'Chaves' },
    { id: 'torneios', label: 'Torneios' },
    { id: 'copa',     label: 'Copa do Mundo' },
    { id: 'duplas',   label: 'Duplas' },
    { id: 'quadras',  label: 'Quadras' },
  ]

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-900 text-white py-4 px-6 flex items-center justify-between shadow-md">
        <h1 className="text-2xl font-black tracking-tight">🎾 Torneios i9</h1>
        <div className="flex items-center gap-3">
          <a href="/tv" target="_blank" rel="noopener noreferrer"
            className="text-sm bg-yellow-400 text-gray-900 font-bold px-4 py-1.5 rounded-lg hover:bg-yellow-300 transition-colors">
            Tela TV →
          </a>
          <a href="/placar" target="_blank" rel="noopener noreferrer"
            className="text-sm bg-emerald-400 text-gray-900 font-bold px-4 py-1.5 rounded-lg hover:bg-emerald-300 transition-colors">
            Placar →
          </a>
          <button
            onClick={() => { localStorage.removeItem('auth_token'); window.location.replace('/login') }}
            className="text-sm bg-white/10 text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-white/20 transition-colors">
            Sair
          </button>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-xl font-semibold text-sm max-w-sm ${
          toast.type === 'err' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>{toast.msg}</div>
      )}

      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`py-3 px-5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>{t.label}</button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-6">

        {/* ══ CHAVES ════════════════════════════════════════════ */}
        {tab === 'chaves' && (
          <ChavesTab
            tournaments={tournaments}
            matches={matches}
            courts={courts}
            teams={teams}
            onReload={load}
            notify={notify}
          />
        )}

        {/* ══ COPA DO MUNDO ════════════════════════════════════ */}
        {tab === 'copa' && (
          <CopaTab
            tournaments={tournaments.filter(t => t.type === 'ffa')}
            teams={teams}
            courts={courts}
            onReload={load}
            notify={notify}
          />
        )}

        {/* ══ TORNEIOS ══════════════════════════════════════════ */}
        {tab === 'torneios' && (
          <TourneiosTab
            tournaments={tournaments} teams={teams} courts={courts}
            onReload={load} notify={notify}
          />
        )}

        {/* ══ DUPLAS ════════════════════════════════════════════ */}
        {tab === 'duplas' && (
          <DuplasTab
            teams={teams} p1={p1} p2={p2} pCat={pCat}
            setP1={setP1} setP2={setP2} setPCat={setPCat}
            onReload={load} notify={notify} createTeam={createTeam}
          />
        )}

        {/* ══ QUADRAS ═══════════════════════════════════════════ */}
        {tab === 'quadras' && (
          <QuadrasTab courts={courts} courtName={courtName} setCourtName={setCourtName}
            onReload={load} notify={notify} createCourt={createCourt} />
        )}
      </main>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// DUPLAS TAB
// ════════════════════════════════════════════════════════════════
function DuplasTab({ teams, p1, p2, pCat, setP1, setP2, setPCat, onReload, notify, createTeam }) {
  const [editingId,   setEditingId]  = useState(null)
  const [editP1,      setEditP1]     = useState('')
  const [editP2,      setEditP2]     = useState('')
  const [editCat,     setEditCat]    = useState('')
  const [editColor,   setEditColor]  = useState('')
  const [filterCat,   setFilterCat]  = useState('')
  const [filterColor, setFilterColor] = useState('')
  const [importing,   setImporting]  = useState(false)
  const importRef = useRef(null)
  const { confirm, modal: confirmModal } = useConfirm()

  const handleExport = async () => {
    try {
      const res = await authFetch(`${API_URL}/teams/export`)
      if (!res.ok) { notify('Erro ao exportar', 'err'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = 'duplas.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { notify(err.message, 'err') }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await authFetch(`${API_URL}/teams/import`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { notify(data.error || `Erro HTTP ${res.status}`, 'err'); return }
      await onReload()
      notify(`✅ ${data.imported} dupla${data.imported !== 1 ? 's' : ''} importada${data.imported !== 1 ? 's' : ''}!`)
      if (data.errors?.length) notify(`⚠ ${data.errors.length} linha(s) com erro`, 'err')
    } catch (err) { notify(err.message, 'err') }
    finally { setImporting(false); if (importRef.current) importRef.current.value = '' }
  }

  const startEdit = (t) => { setEditingId(t.id); setEditP1(t.player1); setEditP2(t.player2); setEditCat(t.category || ''); setEditColor(t.colorTeam || '') }
  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    if (!editP1.trim() || !editP2.trim() || !editCat) return notify('Preencha todos os campos', 'err')
    try {
      await api.put(`/teams/${id}`, { player1: editP1, player2: editP2, category: editCat, colorTeam: editColor })
      await onReload(); notify('Dupla atualizada!')
    } catch (err) { notify(err.message, 'err') }
    cancelEdit()
  }

  const deleteTeam = async (id, name) => {
    if (!await confirm(`Excluir a dupla "${name}"?`)) return
    try {
      await api.delete(`/teams/${id}`)
      await onReload(); notify('Dupla excluída.')
    } catch (err) { notify(err.message, 'err') }
  }

  const filtered = teams.filter(t =>
    (!filterCat   || t.category  === filterCat) &&
    (!filterColor || t.colorTeam === filterColor)
  )

  // Group teams by category for display
  const grouped = TEAM_CATEGORIES
    .map(cat => ({ cat, list: filtered.filter(t => t.category === cat) }))
    .filter(g => g.list.length > 0)
  const uncategorized = filtered.filter(t => !t.category || !TEAM_CATEGORIES.includes(t.category))

  return (
    <>
      <Card title="Nova Dupla">
        <form onSubmit={createTeam} className="flex flex-wrap gap-3 items-end">
          <div className="w-44">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Categoria *</label>
            <select value={pCat} onChange={e => setPCat(e.target.value)} required className="input w-full">
              <option value="">Selecionar...</option>
              {TEAM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-32">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Jogador 1</label>
            <input value={p1} onChange={e => setP1(e.target.value)} placeholder="Nome" required className="input w-full" />
          </div>
          <div className="flex-1 min-w-32">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Jogador 2</label>
            <input value={p2} onChange={e => setP2(e.target.value)} placeholder="Nome" required className="input w-full" />
          </div>
          <Btn type="submit" color="blue">Criar</Btn>
        </form>

        <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-1">
          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide mr-1">Excel:</span>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <button onClick={() => importRef.current?.click()} disabled={importing}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors">
            {importing ? '⏳ Importando...' : '📥 Importar'}
          </button>
          {teams.length > 0 && (
            <button onClick={handleExport}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
              📤 Exportar
            </button>
          )}
          {teams.length > 0 && (
            <button onClick={async () => {
              if (!await confirm(`Excluir todas as ${teams.length} duplas? Esta ação não pode ser desfeita.`)) return
              try {
                await api.delete('/teams')
                await onReload(); notify('Todas as duplas foram excluídas.')
              } catch (err) { notify(err.message, 'err') }
            }}
              className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors ml-auto">
              🗑 Excluir todas
            </button>
          )}
          <span className="text-xs text-gray-300 ml-1">Formato: Jogador 1 | Jogador 2 | Categoria | Time (opcional)</span>
        </div>
      </Card>

      {/* Filtros */}
      {teams.length > 0 && (
        <div className="space-y-2">
          {/* Filtro por time (cor) */}
          {teams.some(t => t.colorTeam) && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Time:</span>
              <button onClick={() => setFilterColor('')}
                className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-colors ${
                  !filterColor ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                }`}>Todos</button>
              {FFA_COLORS.filter(c => teams.some(t => t.colorTeam === c)).map(c => {
                const s = COLOR_STYLE[c]
                return (
                  <button key={c} onClick={() => setFilterColor(filterColor === c ? '' : c)}
                    className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-colors ${
                      filterColor === c ? `${s.bg} ${s.text} border-transparent` : 'border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}>{c} ({teams.filter(t => t.colorTeam === c).length})</button>
                )
              })}
            </div>
          )}
          {/* Filtro por categoria */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Categoria:</span>
            <button onClick={() => setFilterCat('')}
              className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-colors ${
                !filterCat ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}>Todas ({teams.length})</button>
            {TEAM_CATEGORIES.filter(c => teams.some(t => t.category === c)).map(c => (
              <button key={c} onClick={() => setFilterCat(filterCat === c ? '' : c)}
                className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-colors ${
                  filterCat === c ? `${teamCatStyle(c)} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-400'
                }`}>{c} ({teams.filter(t => t.category === c).length})</button>
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 && <Empty msg="Nenhuma dupla cadastrada." />}

      {/* Duplas agrupadas por categoria */}
      {[...grouped, ...(uncategorized.length > 0 ? [{ cat: 'Sem categoria', list: uncategorized }] : [])].map(({ cat, list }) => (
        <div key={cat}>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${teamCatStyle(cat)}`}>{cat}</span>
            <span className="text-xs text-gray-400">{list.length} dupla{list.length !== 1 ? 's' : ''}</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {list.map(t => (
              <div key={t.id} className="border rounded-xl p-3 text-sm bg-white">
                {editingId === t.id ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {TEAM_CATEGORIES.map(c => (
                        <button key={c} type="button" onClick={() => setEditCat(c)}
                          className={`px-2 py-0.5 text-xs font-bold rounded-full border transition-colors ${
                            editCat === c ? `${teamCatStyle(c)} border-current` : 'border-gray-200 text-gray-400'
                          }`}>{c}</button>
                      ))}
                    </div>
                    <input value={editP1} onChange={e => setEditP1(e.target.value)} className="input w-full text-xs py-1" placeholder="Jogador 1" />
                    <input value={editP2} onChange={e => setEditP2(e.target.value)} className="input w-full text-xs py-1" placeholder="Jogador 2" />
                    {/* Seletor de time (opcional) */}
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-gray-400">Time:</span>
                      <button type="button" onClick={() => setEditColor('')}
                        className={`px-2 py-0.5 text-xs font-bold rounded-full border transition-colors ${
                          !editColor ? 'bg-gray-200 text-gray-600 border-gray-300' : 'border-gray-200 text-gray-300'
                        }`}>—</button>
                      {FFA_COLORS.map(c => {
                        const s = COLOR_STYLE[c]
                        return (
                          <button key={c} type="button" onClick={() => setEditColor(c)}
                            className={`px-2 py-0.5 text-xs font-bold rounded-full border transition-colors ${
                              editColor === c ? `${s.bg} ${s.text} border-transparent` : 'border-gray-200 text-gray-300'
                            }`}>{c}</button>
                        )
                      })}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => saveEdit(t.id)} className="flex-1 py-1 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700">✓ Salvar</button>
                      <button onClick={cancelEdit} className="px-3 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${teamCatStyle(t.category)}`}>{t.category || '—'}</span>
                        {t.colorTeam && (() => {
                          const s = COLOR_STYLE[t.colorTeam]
                          return <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>{t.colorTeam}</span>
                        })()}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEdit(t)} className="text-gray-300 hover:text-blue-500 text-xs px-1 transition-colors">✏</button>
                        <button onClick={() => deleteTeam(t.id, `${t.player1} / ${t.player2}`)} className="text-gray-300 hover:text-red-500 text-xs px-1 transition-colors">🗑</button>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-800 text-xs leading-tight">{t.player1}</p>
                    <p className="text-gray-400 text-xs">/ {t.player2}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {confirmModal}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// QUADRAS TAB
// ════════════════════════════════════════════════════════════════
function QuadrasTab({ courts, courtName, setCourtName, onReload, notify, createCourt }) {
  const [editingId,   setEditingId]   = useState(null)
  const [editingName, setEditingName] = useState('')
  const { confirm, modal: confirmModal } = useConfirm()

  const startEdit = (c) => { setEditingId(c.id); setEditingName(c.name) }
  const cancelEdit = () => { setEditingId(null); setEditingName('') }

  const saveEdit = async (id) => {
    if (!editingName.trim()) return
    try {
      await api.put(`/courts/${id}`, { name: editingName.trim() })
      await onReload()
      notify('Quadra atualizada!')
    } catch (err) { notify(err.message, 'err') }
    cancelEdit()
  }

  const deleteCourt = async (id, name) => {
    if (!await confirm(`Excluir a quadra "${name}"?`)) return
    try {
      await api.delete(`/courts/${id}`)
      await onReload()
      notify('Quadra excluída.')
    } catch (err) { notify(err.message, 'err') }
  }

  return (
    <>
      <Card title="Nova Quadra">
        <form onSubmit={createCourt} className="flex gap-3">
          <input value={courtName} onChange={e => setCourtName(e.target.value)}
            placeholder="Ex: Quadra 1" required className="flex-1 input" />
          <Btn type="submit" color="blue">Criar</Btn>
        </form>
      </Card>

      <Card title={`Quadras (${courts.length})`}>
        {courts.length === 0 ? <Empty msg="Nenhuma quadra cadastrada." /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {courts.map(c => (
              <div key={c.id} className="border rounded-lg p-3 text-sm flex items-center gap-2">
                {editingId === c.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') cancelEdit() }}
                      className="flex-1 input text-sm py-1"
                    />
                    <button onClick={() => saveEdit(c.id)}
                      className="text-green-600 hover:text-green-800 font-bold text-base px-1">✓</button>
                    <button onClick={cancelEdit}
                      className="text-gray-400 hover:text-gray-600 font-bold text-base px-1">✕</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-medium">🏖️ {c.name}</span>
                    <button onClick={() => startEdit(c)}
                      className="text-gray-300 hover:text-blue-500 text-sm px-1 transition-colors">✏</button>
                    <button onClick={() => deleteCourt(c.id, c.name)}
                      className="text-gray-300 hover:text-red-500 text-sm px-1 transition-colors">🗑</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {confirmModal}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// CHAVES TAB — cards por categoria, modal com partidas
// ════════════════════════════════════════════════════════════════
function ChavesTab({ tournaments, matches: allMatches, courts, teams = [], onReload, notify }) {
  const [search,        setSearch]        = useState('')
  const [selectedKey,   setSelectedKey]   = useState(null)
  const [layout,        setLayout]        = useState('card')

  const action = async (id, act, body = {}) => {
    try {
      await api.post(`/matches/${id}/${act}`, body)
      await onReload()
      if (act === 'call') notify('📢 Chamada enviada para a TV!')
    } catch (err) { notify(err.message, 'err') }
  }

  const sMatches = allMatches.filter(m => !m.tournamentId)
  const tMatches = tournaments.flatMap(t => t.matches)
  const everything = [...tMatches, ...sMatches]

  const playing  = everything.filter(m => m.status === 'playing').length
  const waiting  = everything.filter(m => m.status === 'waiting').length
  const finished = everything.filter(m => m.status === 'finished').length

  // Build events — group tournaments by name+category
  const eventMap = {}
  for (const t of tournaments) {
    if (!t.group) continue
    const key = `${t.name}|||${t.category}`
    if (!eventMap[key]) eventMap[key] = { key, name: t.name, category: t.category, groups: [], bracket: null, standalone: null }
    eventMap[key].groups.push(t)
  }
  for (const t of tournaments) {
    if (t.group) continue
    const key = `${t.name}|||${t.category}`
    if (eventMap[key]) {
      eventMap[key].bracket = t
    } else {
      eventMap[key] = { key, name: t.name, category: t.category, groups: [], bracket: null, standalone: t }
    }
  }
  const events = Object.values(eventMap)

  const generateBracket = async (evName, evCategory) => {
    try {
      await api.post('/tournaments/generate-bracket', { name: evName, category: evCategory })
      await onReload()
      notify('🏆 Chave final gerada com sucesso!')
    } catch (err) { notify(err.message, 'err') }
  }

  // Search mode — flat list across everything
  const flatList = everything
    .filter(m => {
      if (!search) return true
      const q = search.toLowerCase()
      return [m.teamA?.player1, m.teamA?.player2, m.teamB?.player1, m.teamB?.player2]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    .map(m => {
      const t = tournaments.find(t => t.id === m.tournamentId)
      return { ...m, _tournament: t || null }
    })
    .sort((a, b) => {
      const o = { playing: 0, waiting: 1, finished: 2 }
      return (o[a.status] ?? 1) - (o[b.status] ?? 1) || (a.position || 0) - (b.position || 0)
    })

  const listMatches = everything.map(m => {
    const t = tournaments.find(tt => tt.id === m.tournamentId)
    return { ...m, _category: t?.category || m.category || '', _group: t?.group || '', _tournament: t || null }
  }).sort((a, b) => {
    if (!a.scheduledTime && !b.scheduledTime) return (a.position || 0) - (b.position || 0)
    if (!a.scheduledTime) return 1
    if (!b.scheduledTime) return -1
    const dA = stDayOrder(a.scheduledTime), dB = stDayOrder(b.scheduledTime)
    if (dA !== dB) return dA - dB
    return parseST(a.scheduledTime).time.localeCompare(parseST(b.scheduledTime).time)
  })

  const selectedEvent = selectedKey === '__standalone'
    ? { key: '__standalone', name: 'Partidas Avulsas', category: '', groups: [], bracket: null, standalone: null, _sMatches: sMatches }
    : events.find(e => e.key === selectedKey) || null

  return (
    <>
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-5 text-sm mb-4 items-center">
          <span className="flex items-center gap-1.5 font-bold text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            {playing} em jogo
          </span>
          <span className="font-semibold text-amber-600">{waiting} aguardando</span>
          <span className="text-gray-400">{finished} finalizadas</span>
          <span className="text-gray-300 text-xs">{everything.length} total</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => printAllMatches(listMatches)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
              🖨 Imprimir tudo
            </button>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-bold">
              <button onClick={() => setLayout('card')}
                className={`px-3 py-1.5 transition-colors ${layout === 'card' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                ⊞ Card
              </button>
              <button onClick={() => setLayout('lista')}
                className={`px-3 py-1.5 transition-colors border-l border-gray-200 ${layout === 'lista' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                ☰ Lista
              </button>
            </div>
          </div>
        </div>
        <input
          type="search"
          placeholder="🔍  Buscar por nome do jogador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input w-full text-base"
        />
      </div>

      {search ? (
        <>
          <p className="text-sm text-gray-400 -mt-3 pl-1">{flatList.length} partida{flatList.length !== 1 ? 's' : ''}</p>
          {flatList.length === 0 && <Empty msg="Nenhuma partida encontrada." />}
          {flatList.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {flatList.map(m => <ChavesMatchRow key={m.id} match={m} courts={courts} onAction={action} showContext />)}
            </div>
          )}
        </>
      ) : layout === 'lista' ? (
        <>
          {everything.length === 0 && <Empty msg="Nenhum torneio cadastrado. Crie um na aba Torneios." />}
          {listMatches.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
              {listMatches.map(m => {
                const roundLabel = ROUND_LABELS[m.round?.toLowerCase()] || m.round || ''
                return (
                  <div key={m.id} className="border-l-4" style={{ borderLeftColor: catLeftColor(m._category) }}>
                    <div className="flex items-center gap-2 px-4 pt-2">
                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${catTagStyle(m._category)}`}>
                        {m._category || '—'}
                      </span>
                      {m._group && <span className="text-xs text-gray-400 font-semibold">Grupo {m._group}</span>}
                      {roundLabel && <span className="text-xs text-gray-400">{roundLabel}</span>}
                      {m.scheduledTime && (() => {
                        const { day, time } = parseST(m.scheduledTime)
                        return (
                          <span className="text-xs font-bold text-gray-500 ml-auto pr-1 flex items-center gap-1">
                            {day && <span className="text-purple-500 font-black">{day}</span>}
                            {time}
                          </span>
                        )
                      })()}
                    </div>
                    <ChavesMatchRow match={m} courts={courts} onAction={action} />
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {everything.length === 0 && <Empty msg="Nenhum torneio cadastrado. Crie um na aba Torneios." />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {events.map(ev => {
              const allT   = [...ev.groups, ...(ev.standalone ? [ev.standalone] : []), ...(ev.bracket ? [ev.bracket] : [])]
              const ms     = allT.flatMap(t => t.matches)
              const inPlay = ms.filter(m => m.status === 'playing').length
              const done   = ms.filter(m => m.status === 'finished').length
              const total  = ms.length
              const canGenerate = ev.groups.length >= 2
                && ev.groups.every(t => t.matches.length > 0 && t.matches.every(m => m.status === 'finished'))
              return (
                <EventCard key={ev.key} ev={ev} inPlay={inPlay} done={done} total={total}
                  canGenerate={canGenerate}
                  onClick={() => setSelectedKey(ev.key)}
                  onGenerateBracket={() => generateBracket(ev.name, ev.category)}
                />
              )
            })}
            {sMatches.length > 0 && (
              <EventCard
                ev={{ key: '__standalone', name: 'Partidas Avulsas', category: '', groups: [], bracket: null }}
                inPlay={sMatches.filter(m => m.status === 'playing').length}
                done={sMatches.filter(m => m.status === 'finished').length}
                total={sMatches.length}
                canGenerate={false}
                onClick={() => setSelectedKey('__standalone')}
                onGenerateBracket={() => {}}
              />
            )}
          </div>
        </>
      )}

      {selectedEvent && (
        <EventModal
          key={selectedEvent.key}
          ev={selectedEvent}
          sMatches={selectedKey === '__standalone' ? sMatches : null}
          courts={courts}
          teams={teams}
          onAction={action}
          onClose={() => setSelectedKey(null)}
          onGenerateBracket={generateBracket}
        />

      )}
    </>
  )
}

// ── EventCard ──────────────────────────────────────────────────────
function EventCard({ ev, inPlay, done, total, canGenerate, onClick, onGenerateBracket }) {
  const pct          = total > 0 ? Math.round((done / total) * 100) : 0
  const allDone      = total > 0 && done === total
  const [showPreview, setShowPreview] = useState(false)

  const groupLeaders = ev.groups.map(t => {
    const teamsMap = {}
    for (const m of t.matches) {
      if (m.status !== 'finished') continue
      if (m.teamA && !teamsMap[m.teamAId]) teamsMap[m.teamAId] = { team: m.teamA, wins: 0 }
      if (m.teamB && !teamsMap[m.teamBId]) teamsMap[m.teamBId] = { team: m.teamB, wins: 0 }
      if (m.winnerTeamId === m.teamAId && teamsMap[m.teamAId]) teamsMap[m.teamAId].wins++
      if (m.winnerTeamId === m.teamBId && teamsMap[m.teamBId]) teamsMap[m.teamBId].wins++
    }
    const sorted = Object.values(teamsMap).sort((a, b) => b.wins - a.wins)
    return { group: t.group, leader: sorted[0] || null }
  })

  const matchups = []
  for (let i = 0; i < groupLeaders.length - 1; i += 2) matchups.push([groupLeaders[i], groupLeaders[i + 1]])
  const tname = l => l ? `${l.team.player1} / ${l.team.player2}` : null

  const allStandings = (() => {
    const allM = [...ev.groups.flatMap(t => t.matches), ...(ev.standalone ? ev.standalone.matches : [])]
    const tm = {}
    for (const m of allM) {
      if (m.status !== 'finished') continue
      if (m.teamA && !tm[m.teamAId]) tm[m.teamAId] = { team: m.teamA, wins: 0 }
      if (m.teamB && !tm[m.teamBId]) tm[m.teamBId] = { team: m.teamB, wins: 0 }
      if (m.winnerTeamId === m.teamAId && tm[m.teamAId]) tm[m.teamAId].wins++
      if (m.winnerTeamId === m.teamBId && tm[m.teamBId]) tm[m.teamBId].wins++
    }
    return Object.values(tm).sort((a, b) => b.wins - a.wins)
  })()
  const canPreview = ev.groups.length >= 2 || ev.groups.length === 1 || !!ev.standalone

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border-2 overflow-hidden cursor-pointer hover:shadow-lg transition-all ${
        inPlay > 0 ? 'border-green-400' : allDone ? 'border-gray-200' : 'border-blue-100'
      }`}
    >
      <div className={`px-5 py-6 text-white ${inPlay > 0 ? 'bg-green-800' : allDone ? 'bg-gray-600' : 'bg-gray-800'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-black text-base truncate">{ev.name}</span>
          {inPlay > 0 && (
            <span className="flex items-center gap-1 text-green-300 text-xs font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {inPlay}
            </span>
          )}
        </div>
        {ev.category && <span className="text-xs text-gray-300 mt-0.5 block">{ev.category}</span>}
      </div>

      <div className="bg-white px-5 py-6 space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {ev.groups.map(t => {
            const ok      = t.matches.length > 0 && t.matches.every(m => m.status === 'finished')
            const playing = t.matches.some(m => m.status === 'playing')
            return (
              <span key={t.id} className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                playing ? 'bg-green-100 border-green-300 text-green-800' :
                ok      ? 'bg-gray-100 border-gray-300 text-gray-500'   :
                          'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                {ok ? '✓' : playing ? '▶' : '○'} {t.group}
              </span>
            )
          })}
          {ev.standalone && ev.groups.length === 0 && (() => {
            const ok      = ev.standalone.matches.length > 0 && ev.standalone.matches.every(m => m.status === 'finished')
            const playing = ev.standalone.matches.some(m => m.status === 'playing')
            return (
              <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                playing ? 'bg-green-100 border-green-300 text-green-800' :
                ok      ? 'bg-gray-100 border-gray-300 text-gray-500'   :
                          'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                {ok ? '✓' : playing ? '▶' : '○'} {ev.standalone.matches.length} partidas
              </span>
            )
          })()}
          {ev.bracket && (
            <span className="px-2 py-0.5 rounded-lg text-xs font-bold border bg-yellow-50 border-yellow-300 text-yellow-700">
              🏆 Final
            </span>
          )}
        </div>

        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{done}/{total} partidas</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${allDone ? 'bg-gray-400' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>

        {canPreview && (
          <button
            onClick={e => { e.stopPropagation(); setShowPreview(v => !v) }}
            className={`w-full py-1.5 text-xs font-bold rounded-xl border transition-colors active:scale-95 ${
              showPreview ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100'
            }`}>
            🔮 {showPreview ? 'Ocultar prévia' : 'Previsão Final'}
          </button>
        )}

        {showPreview && canPreview && (
          <div onClick={e => e.stopPropagation()} className="border border-purple-100 rounded-xl overflow-hidden">
            {ev.groups.length >= 2 ? (
              <>
                <div className="bg-purple-50 px-3 py-2 border-b border-purple-100 space-y-1.5">
                  <p className="text-xs font-black text-purple-700 uppercase tracking-wide">Líderes atuais</p>
                  {groupLeaders.map(g => (
                    <div key={g.group} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-purple-500 w-16 shrink-0">Grupo {g.group}</span>
                      {g.leader
                        ? <span className="text-xs font-semibold text-gray-800 truncate">{tname(g.leader)} <span className="text-gray-400">({g.leader.wins}V)</span></span>
                        : <span className="text-xs text-gray-400 italic">sem jogos ainda</span>}
                    </div>
                  ))}
                </div>
                {matchups.length > 0 && (
                  <div className="px-3 py-2 bg-white space-y-2">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-wide">
                      {matchups.length === 1 ? 'Final prevista' : 'Confrontos previstos'}
                    </p>
                    {matchups.map(([a, b], i) => (
                      <div key={i} className="flex items-center gap-1 text-xs">
                        <span className={`font-semibold truncate flex-1 text-right ${a.leader ? 'text-gray-800' : 'text-gray-400'}`}>
                          {a.leader ? tname(a.leader) : `Grupo ${a.group}`}
                        </span>
                        <span className="font-black text-gray-300 shrink-0 px-1">vs</span>
                        <span className={`font-semibold truncate flex-1 ${b.leader ? 'text-gray-800' : 'text-gray-400'}`}>
                          {b.leader ? tname(b.leader) : `Grupo ${b.group}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : allStandings.length >= 2 ? (
              <>
                <div className="bg-purple-50 px-3 py-2 border-b border-purple-100 space-y-1.5">
                  <p className="text-xs font-black text-purple-700 uppercase tracking-wide">Melhores desempenhos</p>
                  {allStandings.slice(0, 4).map((p, i) => (
                    <div key={p.team.id} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-purple-500 w-5 shrink-0">{i + 1}°</span>
                      <span className="text-xs font-semibold text-gray-800 truncate">{p.team.player1} / {p.team.player2} <span className="text-gray-400">({p.wins}V)</span></span>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 bg-white space-y-2">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Final prevista</p>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-semibold truncate flex-1 text-right text-gray-800">{allStandings[0].team.player1} / {allStandings[0].team.player2}</span>
                    <span className="font-black text-gray-300 shrink-0 px-1">vs</span>
                    <span className="font-semibold truncate flex-1 text-gray-800">{allStandings[1].team.player1} / {allStandings[1].team.player2}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="px-3 py-4 bg-purple-50 text-xs text-gray-400 italic text-center">
                Aguardando jogos finalizados...
              </div>
            )}
          </div>
        )}

        {canGenerate && (
          <button
            onClick={e => { e.stopPropagation(); onGenerateBracket() }}
            className="w-full py-1.5 text-xs font-bold bg-yellow-400 text-gray-900 rounded-xl hover:bg-yellow-300 active:scale-95 transition-transform">
            {ev.bracket ? '🔄 Regerar Chave Final' : '🏆 Gerar Chave Final'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── PreviewBracket ─────────────────────────────────────────────────
function PreviewBracket({ ev }) {
  // Standings view for 1-group or standalone tournaments
  if (ev.groups.length < 2) {
    const allM = [...ev.groups.flatMap(t => t.matches), ...(ev.standalone ? ev.standalone.matches : [])]
    const tm = {}
    for (const m of allM) {
      if (m.status !== 'finished') continue
      if (m.teamA && !tm[m.teamAId]) tm[m.teamAId] = { team: m.teamA, wins: 0 }
      if (m.teamB && !tm[m.teamBId]) tm[m.teamBId] = { team: m.teamB, wins: 0 }
      if (m.winnerTeamId === m.teamAId && tm[m.teamAId]) tm[m.teamAId].wins++
      if (m.winnerTeamId === m.teamBId && tm[m.teamBId]) tm[m.teamBId].wins++
    }
    const standings = Object.values(tm).sort((a, b) => b.wins - a.wins)
    if (standings.length < 2) {
      return <div className="flex items-center justify-center h-full text-sm text-gray-400 italic">Aguardando mais jogos...</div>
    }
    return (
      <div className="flex gap-6 h-full overflow-x-auto pb-2">
        <div className="flex flex-col min-w-52 flex-1">
          <div className="text-center mb-3 shrink-0">
            <span className="text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Melhores desempenhos</span>
          </div>
          <div className="flex flex-col gap-2">
            {standings.slice(0, 6).map((p, i) => (
              <div key={p.team.id} className={`rounded-xl border-2 overflow-hidden ${i < 2 ? 'border-purple-200' : 'border-gray-100'}`}>
                <div className={`px-3 py-1 text-xs font-black ${i < 2 ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-400'}`}>{i + 1}° lugar</div>
                <div className="px-3 py-2 bg-white flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-800 flex-1">{p.team.player1} / {p.team.player2}</span>
                  <span className="text-xs text-green-600 font-bold shrink-0">{p.wins}V</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col min-w-52 flex-1">
          <div className="text-center mb-3 shrink-0">
            <span className="text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Final</span>
          </div>
          <div className="flex flex-col flex-1 justify-center">
            <div className="border-2 border-purple-300 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-purple-600 px-3 py-1 text-xs font-black text-white text-center uppercase tracking-wide">🏆 Final Prevista</div>
              <div className="px-3 py-3 bg-purple-50 space-y-2">
                <div className="text-xs font-bold text-gray-800 leading-snug">{standings[0].team.player1} / {standings[0].team.player2}</div>
                <div className="text-center text-xs font-black text-purple-200">vs</div>
                <div className="text-xs font-bold text-gray-800 leading-snug">{standings[1].team.player1} / {standings[1].team.player2}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const groupLeaders = ev.groups.map(t => {
    const teamsMap = {}
    for (const m of t.matches) {
      if (m.status !== 'finished') continue
      if (m.teamA && !teamsMap[m.teamAId]) teamsMap[m.teamAId] = { team: m.teamA, wins: 0, losses: 0 }
      if (m.teamB && !teamsMap[m.teamBId]) teamsMap[m.teamBId] = { team: m.teamB, wins: 0, losses: 0 }
      if (m.winnerTeamId === m.teamAId) {
        if (teamsMap[m.teamAId]) teamsMap[m.teamAId].wins++
        if (m.teamBId && teamsMap[m.teamBId]) teamsMap[m.teamBId].losses++
      }
      if (m.winnerTeamId === m.teamBId) {
        if (teamsMap[m.teamBId]) teamsMap[m.teamBId].wins++
        if (m.teamAId && teamsMap[m.teamAId]) teamsMap[m.teamAId].losses++
      }
    }
    const ranking = Object.values(teamsMap).sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    const allDone = t.matches.length > 0 && t.matches.every(m => m.status === 'finished')
    return { group: t.group, leader: ranking[0]?.team || null, wins: ranking[0]?.wins ?? 0, allDone }
  })

  const pairs = []
  for (let i = 0; i < groupLeaders.length; i += 2) {
    pairs.push([groupLeaders[i], groupLeaders[i + 1] || null])
  }

  const r1Label = pairs.length === 1 ? 'Final' : pairs.length === 2 ? 'Semifinal' : 'Quartas de Final'
  const showFinal = pairs.length > 1
  const name = t => t ? `${t.player1} / ${t.player2}` : null

  const GroupCard = ({ gl }) => (
    <div className={`rounded-xl border-2 overflow-hidden ${gl.allDone ? 'border-green-300' : gl.leader ? 'border-purple-200' : 'border-dashed border-gray-200'}`}>
      <div className={`px-3 py-1 text-xs font-black ${gl.allDone ? 'bg-green-500 text-white' : gl.leader ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
        Grupo {gl.group} {gl.allDone ? '✓' : ''}
      </div>
      <div className="px-3 py-2 bg-white min-h-[52px] flex flex-col justify-center">
        {gl.leader ? (
          <>
            <div className="text-xs font-bold text-gray-800 leading-snug">{gl.leader.player1}</div>
            <div className="text-xs font-bold text-gray-800 leading-snug">{gl.leader.player2}</div>
            <div className="text-xs text-green-600 font-semibold mt-0.5">{gl.wins}V</div>
          </>
        ) : (
          <div className="text-xs text-gray-400 italic">Aguardando jogos...</div>
        )}
      </div>
    </div>
  )

  const MatchupCard = ({ a, b }) => (
    <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-3 py-1 text-xs font-black text-gray-400 text-center uppercase tracking-wide">
        {r1Label}
      </div>
      <div className="px-3 py-3 bg-white space-y-2">
        <div className={`text-xs font-bold leading-snug ${a?.leader ? 'text-gray-800' : 'text-gray-400 italic'}`}>
          {a?.leader ? name(a.leader) : a ? `→ Líder Grupo ${a.group}` : '?'}
        </div>
        <div className="text-center text-xs font-black text-gray-200">vs</div>
        <div className={`text-xs font-bold leading-snug ${b?.leader ? 'text-gray-800' : 'text-gray-400 italic'}`}>
          {b?.leader ? name(b.leader) : b ? `→ Líder Grupo ${b.group}` : '?'}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex gap-6 h-full overflow-x-auto pb-2">
      {/* Coluna: Líderes dos grupos */}
      <div className="flex flex-col min-w-52">
        <div className="text-center mb-3 shrink-0">
          <span className="text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Grupos</span>
        </div>
        <div className="flex flex-col flex-1 gap-3" style={{ justifyContent: 'space-evenly' }}>
          {groupLeaders.map(gl => <GroupCard key={gl.group} gl={gl} />)}
        </div>
      </div>

      {/* Coluna: 1º round knockout (semis ou final direta) */}
      <div className="flex flex-col min-w-52 flex-1">
        <div className="text-center mb-3 shrink-0">
          <span className="text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{r1Label}</span>
        </div>
        <div className="flex flex-col flex-1 gap-4" style={{ justifyContent: pairs.length === 1 ? 'center' : 'space-evenly' }}>
          {pairs.map(([a, b], i) => <MatchupCard key={i} a={a} b={b} />)}
        </div>
      </div>

      {/* Coluna: Final (somente quando há semis) */}
      {showFinal && (
        <div className="flex flex-col min-w-52 flex-1">
          <div className="text-center mb-3 shrink-0">
            <span className="text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Final</span>
          </div>
          <div className="flex flex-col flex-1 justify-center">
            <div className="border-2 border-purple-300 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-purple-600 px-3 py-1 text-xs font-black text-white text-center uppercase tracking-wide">🏆 Final</div>
              <div className="px-3 py-3 bg-purple-50 space-y-2">
                {pairs[0] && (
                  <div className="text-xs font-bold text-purple-400 italic leading-snug">
                    Vencedor: Grupo {pairs[0][0]?.group} vs {pairs[0][1]?.group}
                  </div>
                )}
                <div className="text-center text-xs font-black text-purple-200">vs</div>
                {pairs[1] && (
                  <div className="text-xs font-bold text-purple-400 italic leading-snug">
                    Vencedor: Grupo {pairs[1][0]?.group} vs {pairs[1][1]?.group}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── EventModal ─────────────────────────────────────────────────────
function EventModal({ ev, sMatches, courts, teams = [], onAction, onClose, onGenerateBracket }) {
  const sections = [
    ...ev.groups.map(t => ({ id: t.group, label: `Grupo ${t.group}`, tournament: t })),
    ...(ev.standalone ? [{ id: '__solo', label: ev.standalone.name, tournament: ev.standalone }] : []),
    ...(ev.bracket    ? [{ id: '__final', label: '🏆 Chave Final', tournament: ev.bracket }]    : []),
    ...((ev.groups.length >= 1 || ev.standalone) ? [{ id: '__preview', label: '🔮 Prévia Final' }] : []),
  ]
  const [activeId, setActiveId] = useState(sections[0]?.id ?? null)

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const canGenerate = ev.groups.length >= 2
    && ev.groups.every(t => t.matches.length > 0 && t.matches.every(m => m.status === 'finished'))

  const activeSection = sections.find(s => s.id === activeId) || sections[0]

  const sortM = (ms) => [...ms].sort((a, b) => {
    const o = { playing: 0, waiting: 1, finished: 2 }
    return (o[a.status] ?? 1) - (o[b.status] ?? 1) || (a.position || 0) - (b.position || 0)
  })

  let displayMatches = []
  if (sMatches) {
    displayMatches = sortM(sMatches)
  } else if (activeSection && activeSection.tournament) {
    const ms = activeSection.tournament.matches
    if (activeSection.id === '__final') {
      const byRound = groupByRound(ms)
      displayMatches = byRound.flatMap(({ matches }) => matches)
    } else {
      displayMatches = sortM(ms)
    }
  }

  const isBracket = activeSection?.id === '__final'
  const isPreview = activeSection?.id === '__preview'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col transition-all duration-300"
        style={{ width: (isBracket || isPreview) ? '95vw' : '80vw', height: (isBracket || isPreview) ? '95vh' : '80vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-gray-900 text-white px-5 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-lg">{ev.name}</span>
            {ev.category && (
              <span className="text-xs bg-yellow-400 text-gray-900 font-black px-2 py-0.5 rounded-full uppercase">
                {ev.category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => printEvent(ev)}
              className="text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors">
              🖨 Imprimir
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none transition-colors">×</button>
          </div>
        </div>

        {/* Gerar / Regerar chave banner */}
        {canGenerate && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-5 py-3 flex items-center justify-between shrink-0">
            <span className="text-sm font-semibold text-yellow-800">
              {ev.bracket ? 'Chave final já gerada.' : 'Todos os grupos finalizados!'}
            </span>
            <button
              onClick={() => { onGenerateBracket(ev.name, ev.category); onClose() }}
              className="px-4 py-1.5 text-sm font-bold bg-yellow-400 text-gray-900 rounded-xl hover:bg-yellow-300 active:scale-95 transition-transform">
              {ev.bracket ? '🔄 Regerar Chave Final' : '🏆 Gerar Chave Final'}
            </button>
          </div>
        )}

        {/* Tabs */}
        {sections.length > 1 && (
          <div className="flex px-6 pt-3 border-b border-gray-100 overflow-x-auto shrink-0">
            {sections.map(s => (
              <button key={s.id} onClick={() => setActiveId(s.id)}
                className={`px-5 py-2.5 text-base font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  activeSection?.id === s.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Conteúdo */}
        <div className={`flex-1 p-5 ${(isBracket || isPreview) ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {isPreview ? (
            <PreviewBracket ev={ev} />
          ) : isBracket ? (
            <div className="flex gap-4 min-h-full overflow-x-auto">
              {groupByRound(activeSection.tournament.matches).map(({ round, matches: rMatches }) => (
                <div key={round} className="flex-1 min-w-56 flex flex-col">
                  <div className="text-center mb-3 shrink-0">
                    <span className="text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                      {ROUND_LABELS[round.toLowerCase()] || round}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 flex-1"
                    style={{ justifyContent: rMatches.length === 1 ? 'center' : 'space-evenly' }}>
                    {[...rMatches].sort((a,b) => (a.position||0)-(b.position||0)).map(m => (
                      <div key={m.id} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <ChavesMatchRow match={m} courts={courts} onAction={onAction} card allTeams={teams} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            displayMatches.length === 0
              ? <p className="text-center text-gray-400 text-sm py-12">Nenhuma partida.</p>
              : (
                <div className="grid grid-cols-2 gap-3 content-start">
                  {displayMatches.map(m => (
                    <div key={m.id} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <ChavesMatchRow match={m} courts={courts} onAction={onAction} showContext={!!sMatches} card />
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      </div>
    </div>
  )
}

// ── ChavesMatchRow ─────────────────────────────────────────────────
// card=true → layout vertical para a modal; card=false → linha horizontal para busca
function ChavesMatchRow({ match, onAction, showContext, courts = [], card = false, allTeams = [] }) {
  const [sA, setSA]               = useState(String(match.scoreA))
  const [sB, setSB]               = useState(String(match.scoreB))
  const [editing, setEditing]     = useState(false)
  const [editTeams, setEditTeams] = useState(false)
  const [editTeamA, setEditTeamA] = useState(match.teamAId || '')
  const [editTeamB, setEditTeamB] = useState(match.teamBId || '')
  const [courtId, setCourtId]     = useState(match.courtId || '')
  const [schedDay,  setSchedDay]  = useState(() => parseST(match.scheduledTime).day)
  const [schedTime, setSchedTime] = useState(() => parseST(match.scheduledTime).time)
  useEffect(() => {
    setSA(String(match.scoreA))
    setSB(String(match.scoreB))
    setEditing(false)
    setEditTeams(false)
    setEditTeamA(match.teamAId || '')
    setEditTeamB(match.teamBId || '')
    setCourtId(match.courtId || '')
    const p = parseST(match.scheduledTime)
    setSchedDay(p.day)
    setSchedTime(p.time)
  }, [match.scoreA, match.scoreB, match.courtId, match.teamAId, match.teamBId, match.scheduledTime])

  const handleCourtChange = (cid) => {
    setCourtId(cid)
    onAction(match.id, 'court', { courtId: cid || null })
  }

  const nameA = match.teamA ? `${match.teamA.player1} / ${match.teamA.player2}` : 'A definir'
  const nameB = match.teamB ? `${match.teamB.player1} / ${match.teamB.player2}` : 'A definir'
  const winA  = match.winnerTeamId === match.teamAId
  const winB  = match.winnerTeamId === match.teamBId

  const statusBg = match.status === 'playing' ? 'bg-green-50' : match.status === 'finished' ? 'bg-gray-50' : 'bg-white'

  // ── Botões de ação (reutilizados nos dois layouts) ──────────────
  const actionButtons = (
    <>
      {card && allTeams.length > 0 && (
        <button onClick={() => setEditTeams(v => !v)}
          className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 border border-gray-200">
          ✏
        </button>
      )}
      {match.status !== 'finished' && (
        <>
          {match.status === 'waiting' && (
            <button onClick={() => onAction(match.id, 'mark-next')}
              title={match.isNext ? 'Desmarcar' : 'Marcar como próxima'}
              className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                match.isNext ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-400 border-gray-200 hover:border-purple-400 hover:text-purple-600'
              }`}>📌</button>
          )}
          {match.status === 'waiting' && (
            <button onClick={() => onAction(match.id, 'call')}
              disabled={!courtId}
              title={!courtId ? 'Selecione uma quadra primeiro' : ''}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors ${
                !courtId ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50' :
                card ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
              } active:scale-95`}>
              {card ? '📢 Chamar' : '📢'}
            </button>
          )}
          {match.status === 'playing' && (
            <button onClick={() => onAction(match.id, 'undo')}
              className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">↩</button>
          )}
          {match.status === 'waiting' && (
            <button onClick={() => onAction(match.id, 'start')}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors ${card ? 'bg-green-600 text-white hover:bg-green-700 px-3' : 'bg-green-600 text-white hover:bg-green-700'} active:scale-95`}>
              {card ? '▶ Iniciar' : '▶'}
            </button>
          )}
          <button onClick={() => onAction(match.id, 'finish', { scoreA: +sA, scoreB: +sB })}
            className={`px-2.5 py-1 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-transform`}>
            {card ? '■ Finalizar' : '■ Fin.'}
          </button>
        </>
      )}
      {match.status === 'finished' && !editing && (
        <button onClick={() => setEditing(true)}
          className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200">✏</button>
      )}
      {match.status === 'finished' && editing && (
        <>
          <button onClick={() => { onAction(match.id, 'edit', { scoreA: +sA, scoreB: +sB }); setEditing(false) }}
            className="px-2.5 py-1 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 active:scale-95">✓ Salvar</button>
          <button onClick={() => { setEditing(false); setSA(String(match.scoreA)); setSB(String(match.scoreB)) }}
            className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">✕</button>
        </>
      )}
    </>
  )

  // ── Layout CARD (modal) ─────────────────────────────────────────
  if (card) {
    const topBg = match.status === 'playing' ? 'bg-green-600' : match.status === 'finished' ? 'bg-gray-500' : 'bg-gray-700'
    return (
      <div className={`flex flex-col ${statusBg}`}>

        {/* Topo: só status */}
        <div className={`flex items-center gap-2 px-3 py-1.5 ${topBg} text-white`}>
          {match.isNext ? (
            <span className="text-xs font-black bg-purple-500 px-2 py-0.5 rounded-full animate-pulse">📌 Próxima</span>
          ) : (
            <span className={`text-xs font-semibold ${
              match.status === 'playing' ? 'text-green-100' : match.status === 'finished' ? 'text-gray-200' : 'text-amber-300'
            }`}>
              {match.status === 'playing' ? '● Em Jogo' : match.status === 'finished' ? '✓ Finalizada' : '○ Aguardando'}
            </span>
          )}
          {match.round && <span className="text-xs text-white/40 truncate">{match.round}</span>}
        </div>

        {/* Centro: nomes + placar horizontal */}
        <div className="flex items-center gap-2 px-3 py-3">
          {/* Dupla A */}
          <span className={`flex-1 text-xs font-bold text-right leading-tight ${
            match.status === 'finished' ? winA ? 'text-green-700' : 'text-gray-400' : 'text-blue-700'
          }`}>{winA && '🏆 '}{nameA}</span>

          {/* Placar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {match.status === 'playing' && (
              <button onClick={() => onAction(match.id, 'score', { team: 'A' })}
                className="w-7 h-7 bg-blue-600 text-white rounded-lg text-base font-black hover:bg-blue-700 active:scale-95">+</button>
            )}
            {match.status === 'finished' && !editing ? (
              <span className={`text-2xl font-black w-8 text-center ${winA ? 'text-green-700' : 'text-blue-600'}`}>{match.scoreA}</span>
            ) : (
              <input type="number" min="0" value={sA} onChange={e => setSA(e.target.value)}
                className="w-10 text-center text-xl font-black text-blue-700 border-2 border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300" />
            )}
            <span className="text-xl font-black text-gray-300">×</span>
            {match.status === 'finished' && !editing ? (
              <span className={`text-2xl font-black w-8 text-center ${winB ? 'text-green-700' : 'text-red-600'}`}>{match.scoreB}</span>
            ) : (
              <input type="number" min="0" value={sB} onChange={e => setSB(e.target.value)}
                className="w-10 text-center text-xl font-black text-red-700 border-2 border-red-200 rounded-lg outline-none focus:ring-2 focus:ring-red-300" />
            )}
            {match.status === 'playing' && (
              <button onClick={() => onAction(match.id, 'score', { team: 'B' })}
                className="w-7 h-7 bg-red-600 text-white rounded-lg text-base font-black hover:bg-red-700 active:scale-95">+</button>
            )}
          </div>

          {/* Dupla B */}
          <span className={`flex-1 text-xs font-bold leading-tight ${
            match.status === 'finished' ? winB ? 'text-green-700' : 'text-gray-400' : 'text-red-700'
          }`}>{winB && '🏆 '}{nameB}</span>
        </div>

        {/* Editar duplas (apenas no card) */}
        {card && editTeams && (
          <div className="px-3 pb-2 flex flex-col gap-1.5 border-t border-gray-100 pt-2">
            <select value={editTeamA} onChange={e => setEditTeamA(e.target.value)}
              className="text-xs py-1 px-2 rounded-lg border border-blue-300 bg-blue-50 text-blue-800 outline-none w-full">
              <option value="">— Dupla A —</option>
              {allTeams.map(t => <option key={t.id} value={t.id}>{t.player1} / {t.player2}</option>)}
            </select>
            <select value={editTeamB} onChange={e => setEditTeamB(e.target.value)}
              className="text-xs py-1 px-2 rounded-lg border border-red-300 bg-red-50 text-red-800 outline-none w-full">
              <option value="">— Dupla B —</option>
              {allTeams.map(t => <option key={t.id} value={t.id}>{t.player1} / {t.player2}</option>)}
            </select>
            <div className="flex gap-1.5">
              <button onClick={() => { onAction(match.id, 'set-teams', { teamAId: editTeamA || null, teamBId: editTeamB || null }); setEditTeams(false) }}
                className="flex-1 py-1 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 active:scale-95">✓ Salvar</button>
              <button onClick={() => { setEditTeams(false); setEditTeamA(match.teamAId || ''); setEditTeamB(match.teamBId || '') }}
                className="px-3 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">✕</button>
            </div>
          </div>
        )}

        {/* Quadra + horário + botões de ação */}
        <div className="flex items-center justify-center gap-2 px-3 pb-3 flex-wrap">
          <select
            value={courtId}
            onChange={e => handleCourtChange(e.target.value)}
            disabled={courts.length === 0}
            className={`text-xs py-1 px-2 rounded-lg border outline-none ${
              courtId
                ? 'border-blue-400 bg-blue-600 text-white font-semibold'
                : courts.length === 0
                  ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 bg-white text-gray-500 hover:border-blue-400'
            }`}>
            <option value="">{courts.length === 0 ? 'Sem quadras' : '🏖 Quadra...'}</option>
            {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden">
            {['Sáb', 'Dom'].map(d => (
              <button key={d} onClick={() => {
                const nd = d === schedDay ? '' : d
                setSchedDay(nd)
                onAction(match.id, 'set-time', { scheduledTime: [nd, schedTime].filter(Boolean).join(' ') })
              }} className={`text-xs px-1.5 py-1 font-bold border-r border-gray-300 transition-colors ${schedDay === d ? 'bg-indigo-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>{d}</button>
            ))}
            <input
              type="text"
              value={schedTime}
              onChange={e => {
                let v = e.target.value.replace(/[^0-9]/g, '')
                if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4)
                setSchedTime(v)
              }}
              onBlur={() => onAction(match.id, 'set-time', { scheduledTime: [schedDay, schedTime].filter(Boolean).join(' ') })}
              placeholder="00:00"
              maxLength={5}
              className="text-xs py-1 px-2 bg-white text-gray-600 outline-none w-14 text-center"
            />
          </div>
          {actionButtons}
        </div>
      </div>
    )
  }

  // ── Layout ROW (busca / lista plana) ────────────────────────────
  const rowBg = match.status === 'playing' ? 'bg-green-50' : match.status === 'finished' ? 'bg-white' : 'bg-white'
  const contextLabel = showContext && match._tournament
    ? [match._tournament.category, match._tournament.group, match.round].filter(Boolean).join(' · ')
    : showContext && match.category ? match.category : match.round || ''

  return (
    <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 transition-colors ${rowBg}`}>
      {match.isNext ? (
        <span className="text-xs font-black bg-purple-600 text-white px-2 py-0.5 rounded-full animate-pulse shrink-0">📌 Próxima</span>
      ) : (
        <span className={`w-2 h-2 rounded-full shrink-0 ${
          match.status === 'playing' ? 'bg-green-500 animate-pulse' : match.status === 'finished' ? 'bg-gray-300' : 'bg-amber-400'
        }`} />
      )}
      {contextLabel && <span className="text-xs text-gray-400 shrink-0 max-w-[130px] truncate">{contextLabel}</span>}
      {courts.length > 0 ? (
        <select value={courtId} onChange={e => handleCourtChange(e.target.value)}
          className={`text-xs py-0.5 px-1.5 rounded-lg border shrink-0 outline-none focus:ring-1 focus:ring-blue-300 ${
            courtId ? 'border-blue-300 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 text-gray-400 bg-white'
          }`}>
          <option value="">Quadra</option>
          {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ) : match.court ? (
        <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded-lg border border-blue-200 shrink-0">{match.court.name}</span>
      ) : null}
      <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden shrink-0">
        {['Sáb', 'Dom'].map(d => (
          <button key={d} onClick={() => {
            const nd = d === schedDay ? '' : d
            setSchedDay(nd)
            onAction(match.id, 'set-time', { scheduledTime: [nd, schedTime].filter(Boolean).join(' ') })
          }} className={`text-xs px-1 py-0.5 font-bold border-r border-gray-200 transition-colors ${schedDay === d ? 'bg-indigo-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>{d}</button>
        ))}
        <input
          type="text"
          value={schedTime}
          onChange={e => {
            let v = e.target.value.replace(/[^0-9]/g, '')
            if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4)
            setSchedTime(v)
          }}
          onBlur={() => onAction(match.id, 'set-time', { scheduledTime: [schedDay, schedTime].filter(Boolean).join(' ') })}
          placeholder="00:00"
          maxLength={5}
          className="text-xs py-0.5 px-1.5 bg-white text-gray-500 outline-none w-12 text-center"
        />
      </div>
      <span className={`flex-1 text-sm font-semibold min-w-0 text-right ${match.status === 'finished' ? winA ? 'text-green-700 font-black' : 'text-gray-500' : 'text-blue-700'}`}>
        {winA && '🏆 '}{nameA}
      </span>
      {match.status === 'finished' && !editing ? (
        <div className="font-black text-lg flex items-center gap-1 shrink-0">
          <span className={winA ? 'text-green-700' : 'text-blue-600'}>{match.scoreA}</span>
          <span className="text-gray-200 text-base">×</span>
          <span className={winB ? 'text-green-700' : 'text-red-600'}>{match.scoreB}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          {match.status === 'playing' && (
            <button onClick={() => onAction(match.id, 'score', { team: 'A' })}
              className="w-7 h-7 bg-blue-600 text-white rounded-lg text-sm font-black hover:bg-blue-700 active:scale-95">+</button>
          )}
          <input type="number" min="0" value={sA} onChange={e => setSA(e.target.value)}
            className="w-10 text-center text-base font-black text-blue-700 border border-blue-200 rounded-lg py-0.5 outline-none focus:ring-2 focus:ring-blue-300" />
          <span className="text-gray-300 font-bold">×</span>
          <input type="number" min="0" value={sB} onChange={e => setSB(e.target.value)}
            className="w-10 text-center text-base font-black text-red-700 border border-red-200 rounded-lg py-0.5 outline-none focus:ring-2 focus:ring-red-300" />
          {match.status === 'playing' && (
            <button onClick={() => onAction(match.id, 'score', { team: 'B' })}
              className="w-7 h-7 bg-red-600 text-white rounded-lg text-sm font-black hover:bg-red-700 active:scale-95">+</button>
          )}
        </div>
      )}
      <span className={`flex-1 text-sm font-semibold min-w-0 ${match.status === 'finished' ? winB ? 'text-green-700 font-black' : 'text-gray-500' : 'text-red-700'}`}>
        {winB && '🏆 '}{nameB}
      </span>
      <div className="flex items-center gap-1 shrink-0">{actionButtons}</div>
    </div>
  )
}

// ── FilterBtn ──────────────────────────────────────────────────────
function FilterBtn({ active, onClick, children, variant = 'blue' }) {
  const activeStyle = {
    blue:   'bg-blue-600 text-white border-blue-600',
    green:  'bg-green-600 text-white border-green-600',
    yellow: 'bg-amber-500 text-white border-amber-500',
    gray:   'bg-gray-600 text-white border-gray-600',
  }
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
        active
          ? activeStyle[variant] || activeStyle.blue
          : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════
// TORNEIOS TAB
// ════════════════════════════════════════════════════════════════
function TourneiosTab({ tournaments, teams, courts, onReload, notify }) {
  const [evName,     setEvName]     = useState('')
  const [evCategory, setEvCategory] = useState('')
  const [evGroups,   setEvGroups]   = useState(4)

  const [name,     setName]     = useState('')
  const [category, setCategory] = useState('')
  const [group,    setGroup]    = useState('')

  const createEvent = async (e) => {
    e.preventDefault()
    try {
      await api.post('/tournaments/create-event', { name: evName, category: evCategory, numGroups: evGroups })
      setEvName(''); setEvCategory(''); setEvGroups(4); onReload()
      notify(`Evento criado com ${evGroups} grupos!`)
    } catch (err) { notify(err.message, 'err') }
  }

  const create = async (e) => {
    e.preventDefault()
    try {
      await api.post('/tournaments', { name, category, group })
      setName(''); setCategory(''); setGroup(''); onReload()
      notify('Torneio criado!')
    } catch (err) { notify(err.message, 'err') }
  }

  // Detect events: same name+category with multiple groups
  const eventMap = {}
  for (const t of tournaments) {
    if (!t.group) continue
    const key = `${t.name}|||${t.category}`
    if (!eventMap[key]) eventMap[key] = { name: t.name, category: t.category, groups: [], bracket: null }
    eventMap[key].groups.push(t)
  }
  for (const t of tournaments) {
    if (t.group) continue
    const key = `${t.name}|||${t.category}`
    if (eventMap[key]) eventMap[key].bracket = t
  }
  const events = Object.values(eventMap).filter(e => e.groups.length >= 2)

  const generateBracket = async (evName, evCategory) => {
    try {
      await api.post('/tournaments/generate-bracket', { name: evName, category: evCategory })
      onReload()
      notify('🏆 Chave final gerada com sucesso!')
    } catch (err) { notify(err.message, 'err') }
  }

  return (
    <>
      {/* ── Criar Evento com Fase de Grupos ──────────── */}
      <Card title="Novo Evento com Fase de Grupos">
        <form onSubmit={createEvent} className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1">Nome do Evento</label>
              <input value={evName} onChange={e => setEvName(e.target.value)} placeholder="Ex: Copa do Mundo BT 2026" required className="input w-full" />
            </div>
            <div className="w-44">
              <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1">Categoria</label>
              <select value={evCategory} onChange={e => setEvCategory(e.target.value)} required className="input w-full">
                <option value="">Selecionar...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-2">Número de Grupos</label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map(n => (
                <button key={n} type="button" onClick={() => setEvGroups(n)}
                  className={`w-12 h-10 rounded-xl text-sm font-black border-2 transition-colors ${
                    evGroups === n
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Serão criados os Grupos {['A','B','C','D','E','F'].slice(0, evGroups).join(', ')}
            </p>
          </div>
          <Btn type="submit" color="blue">Criar Evento</Btn>
        </form>
      </Card>

      {/* ── Criar Torneio Simples (sem fase de grupos) ─ */}
      <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <summary className="px-5 py-3 cursor-pointer text-sm font-semibold text-gray-500 hover:text-gray-800 select-none">
          + Torneio avulso (sem fase de grupos)
        </summary>
        <div className="px-5 pb-4 pt-2">
          <form onSubmit={create} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Copa Inove 2026" required className="input w-full" />
            </div>
            <div className="w-44">
              <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1">Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="input w-full">
                <option value="">Selecionar...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1">Grupo (opcional)</label>
              <div className="flex gap-1.5">
                {['A','B','C','D','E','F'].map(g => (
                  <button key={g} type="button" onClick={() => setGroup(group === g ? '' : g)}
                    className={`w-8 h-8 rounded-lg text-sm font-black border-2 transition-colors ${
                      group === g
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                    }`}>{g}</button>
                ))}
              </div>
            </div>
            <Btn type="submit" color="blue">Criar</Btn>
          </form>
        </div>
      </details>

      {/* ── Eventos com fase de grupos detectados ──── */}
      {events.map(ev => {
        const allDone = ev.groups.every(t =>
          t.matches.length > 0 && t.matches.every(m => m.status === 'finished')
        )
        return (
          <div key={`${ev.name}|||${ev.category}`}
            className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-blue-900 text-lg">{ev.name}</span>
                <span className="bg-yellow-400 text-gray-900 text-xs font-black px-2 py-0.5 rounded-full uppercase">{ev.category}</span>
                <span className="text-blue-500 text-sm">{ev.groups.length} grupos</span>
              </div>
              <Btn color="blue" disabled={!allDone} onClick={() => generateBracket(ev.name, ev.category)}>
                {ev.bracket ? '🔄 Regerar Chave Final' : allDone ? '🏆 Gerar Chave Final' : '⏳ Aguardando grupos...'}
              </Btn>
            </div>
            <div className="flex flex-wrap gap-2">
              {ev.groups.map(t => {
                const done  = t.matches.filter(m => m.status === 'finished').length
                const total = t.matches.length
                const ok    = total > 0 && done === total
                return (
                  <span key={t.id} className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                    ok ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-blue-200 text-blue-700'
                  }`}>
                    {ok ? '✓' : '○'} Grupo {t.group} {total > 0 ? `${done}/${total}` : '(sem partidas)'}
                  </span>
                )
              })}
            </div>
            {!allDone && (
              <p className="text-xs text-blue-500 italic">
                Finalize todas as partidas dos grupos para liberar a geração da chave final.
              </p>
            )}
          </div>
        )
      })}

      {tournaments.length === 0 && <Empty msg="Nenhum torneio criado. Crie um acima." />}

      {[...tournaments].sort((a, b) => {
        const isFinished  = t => t.matches.length > 0 && t.matches.every(m => m.status === 'finished')
        const hasBracket  = t => t.group && tournaments.some(x => !x.group && x.name === t.name && x.category === t.category)
        const sinks = t => isFinished(t) || hasBracket(t)
        return sinks(a) - sinks(b)
      }).map(t => (
        <TournamentCard key={t.id} tournament={t} teams={teams} courts={courts} allTournaments={tournaments} onReload={onReload} notify={notify} />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// TOURNAMENT CARD
// ════════════════════════════════════════════════════════════════
function TournamentCard({ tournament, teams, courts, allTournaments = [], onReload, notify }) {
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  const [dropOpen,     setDropOpen]     = useState(false)
  const dropRef = useRef(null)
  const storageKey = `tournament_open_${tournament.id}`
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved === null ? false : saved === 'true'
  })
  const { confirm, modal: confirmModal } = useConfirm()

  const toggleOpen = (val) => {
    setOpen(val)
    localStorage.setItem(storageKey, String(val))
  }

  const standings = calcStandings(tournament.entries, tournament.matches)

  const rounds = {}
  for (const m of tournament.matches) {
    if (!rounds[m.round]) rounds[m.round] = []
    rounds[m.round].push(m)
  }
  const roundKeys = Object.keys(rounds).sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b)
    return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb
  })

  const action = async (id, act, body = {}) => {
    try {
      await api.post(`/matches/${id}/${act}`, body)
      onReload()
      if (act === 'call') notify('📢 Chamada enviada para a TV!')
    } catch (err) { notify(err.message, 'err') }
  }

  const addTeams = async () => {
    if (selectedIds.size === 0) return
    try {
      for (const teamId of selectedIds) {
        await api.post(`/tournaments/${tournament.id}/teams`, { teamId })
      }
      const n = selectedIds.size
      setSelectedIds(new Set()); setDropOpen(false); onReload()
      notify(`${n} dupla${n !== 1 ? 's' : ''} adicionada${n !== 1 ? 's' : ''}!`)
    } catch (err) { notify(err.message, 'err') }
  }

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!dropOpen) return
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropOpen])

  const removeTeam = async (teamId) => {
    try {
      await authFetch(`${API_URL}/tournaments/${tournament.id}/teams/${teamId}`, { method: 'DELETE' })
      onReload(); notify('Dupla removida.')
    } catch (err) { notify(err.message, 'err') }
  }

  const generate = async () => {
    try {
      await api.post(`/tournaments/${tournament.id}/generate`, {})
      onReload(); notify('Chave gerada!')
    } catch (err) { notify(err.message, 'err') }
  }

  const deleteMatches = async () => {
    if (!await confirm('Excluir todas as partidas desta chave? As duplas inscritas serão mantidas.')) return
    try {
      await authFetch(`${API_URL}/tournaments/${tournament.id}/matches`, { method: 'DELETE' })
      onReload(); notify('Chave excluída.')
    } catch (err) { notify(err.message, 'err') }
  }

  const deleteTournament = async () => {
    if (!await confirm(`Excluir o torneio "${tournament.name}" e todas as partidas?`)) return
    try {
      await authFetch(`${API_URL}/tournaments/${tournament.id}`, { method: 'DELETE' })
      onReload(); notify('Torneio excluído.')
    } catch (err) { notify(err.message, 'err') }
  }

  const categoryTeams = tournament.category
    ? teams.filter(t => t.category === tournament.category)
    : teams

  const siblingUsedIds = new Set(
    allTournaments
      .filter(x => x.id !== tournament.id && x.name === tournament.name && x.category === tournament.category)
      .flatMap(x => x.entries.map(e => e.teamId))
  )

  const availableTeams = categoryTeams.filter(t =>
    !tournament.entries.find(e => e.teamId === t.id) && !siblingUsedIds.has(t.id)
  )
  const totalMatches   = tournament.matches.length
  const doneMatches    = tournament.matches.filter(m => m.status === 'finished').length

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
      <div className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between gap-4 rounded-t-2xl">
        <div>
          <h2 className="text-xl font-black">{tournament.name}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {tournament.category && (
              <span className="bg-yellow-400 text-gray-900 text-xs font-black px-2 py-0.5 rounded-full uppercase">{tournament.category}</span>
            )}
            {tournament.group && (
              <span className="bg-green-400 text-gray-900 text-xs font-black px-2 py-0.5 rounded-full uppercase">{tournament.group}</span>
            )}
            <span className="text-blue-300 text-sm">{tournament.entries.length} duplas</span>
            {totalMatches > 0 && (
              <span className="text-blue-300 text-sm">{doneMatches}/{totalMatches} partidas</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Btn color="green" onClick={generate} disabled={tournament.entries.length < 2}>⚙ Gerar Chave</Btn>
          {tournament.matches.length > 0 && (
            <Btn color="red" onClick={deleteMatches} title="Excluir partidas da chave">🗑 Chave</Btn>
          )}
          <Btn color="gray"  onClick={deleteTournament} title="Excluir torneio completo">🗑</Btn>
          <button onClick={() => toggleOpen(!open)} className="text-white/60 hover:text-white text-xl font-bold w-8 text-center">
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {open && (
        <div className="p-6 space-y-6">

          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1">Adicionar Duplas</label>
            <div className="flex gap-3 items-start">
              <div className="flex-1 relative" ref={dropRef}>
                {/* Trigger */}
                <button
                  type="button"
                  onClick={() => availableTeams.length > 0 && setDropOpen(v => !v)}
                  disabled={availableTeams.length === 0}
                  className="input w-full text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={selectedIds.size > 0 ? 'text-gray-800' : 'text-gray-400'}>
                    {availableTeams.length === 0
                      ? (tournament.category ? `Nenhuma dupla de "${tournament.category}" disponível` : 'Nenhuma dupla disponível')
                      : selectedIds.size > 0
                        ? `${selectedIds.size} dupla${selectedIds.size !== 1 ? 's' : ''} selecionada${selectedIds.size !== 1 ? 's' : ''}`
                        : `Selecionar duplas (${availableTeams.length} disponíve${availableTeams.length !== 1 ? 'is' : 'l'})...`}
                  </span>
                  <span className="text-gray-400 ml-2">{dropOpen ? '▲' : '▼'}</span>
                </button>

                {/* Dropdown panel */}
                {dropOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {availableTeams.map(t => {
                      const checked = selectedIds.has(t.id)
                      return (
                        <label key={t.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedIds(prev => {
                              const next = new Set(prev)
                              checked ? next.delete(t.id) : next.add(t.id)
                              return next
                            })}
                            className="accent-blue-600 w-4 h-4 shrink-0"
                          />
                          <span className="font-semibold">{t.player1}</span>
                          <span className="text-gray-400">/</span>
                          <span className="font-semibold">{t.player2}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              <Btn color="blue" onClick={addTeams} disabled={selectedIds.size === 0}>
                {selectedIds.size > 1 ? `Adicionar (${selectedIds.size})` : 'Adicionar'}
              </Btn>
            </div>
          </div>

          {tournament.entries.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {tournament.entries.map(e => (
                <div key={e.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <span>
                    <span className="bg-blue-100 text-blue-700 font-black text-xs px-1.5 py-0.5 rounded mr-2">{e.seed}</span>
                    <span className="font-semibold">{e.team.player1}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="font-semibold">{e.team.player2}</span>
                  </span>
                  <button onClick={() => removeTeam(e.teamId)} className="text-gray-300 hover:text-red-500 text-xs ml-2">✕</button>
                </div>
              ))}
            </div>
          )}

          {standings.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider mb-2">Classificação</h3>
              <StandingsTable standings={standings} totalEntries={tournament.entries.length} />
            </div>
          )}

          {roundKeys.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">Partidas por Rodada</h3>
              {roundKeys.map(round => {
                const rm   = rounds[round]
                const byes = byeTeams(tournament.entries, rm)
                return (
                  <div key={round}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="text-xs font-black text-gray-500 uppercase tracking-widest">{round}</span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                    <div className="space-y-2">
                      {rm.map(m => (
                        <TournamentMatchRow
                          key={m.id} match={m}
                          seedA={tournament.entries.find(e => e.teamId === m.teamAId)?.seed}
                          seedB={tournament.entries.find(e => e.teamId === m.teamBId)?.seed}
                          courts={courts}
                          onAction={action}
                        />
                      ))}
                      {byes.map(e => (
                        <div key={e.id} className="text-xs text-gray-400 italic pl-2">
                          FOLGA: <span className="font-semibold text-gray-500">{e.seed} — {e.team.player1} / {e.team.player2}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {roundKeys.length === 0 && tournament.entries.length >= 2 && (
            <p className="text-sm text-amber-600 italic">⚠ Clique em "⚙ Gerar Chave" para criar o calendário de partidas.</p>
          )}
        </div>
      )}
      {confirmModal}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// STANDINGS TABLE
// ════════════════════════════════════════════════════════════════
function StandingsTable({ standings, totalEntries }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs font-black uppercase tracking-wide">
            <th className="px-3 py-2 text-left">Pos</th>
            <th className="px-3 py-2 text-left">Dupla</th>
            <th className="px-3 py-2 text-center">J</th>
            <th className="px-3 py-2 text-center">V</th>
            <th className="px-3 py-2 text-center">E</th>
            <th className="px-3 py-2 text-center">D</th>
            <th className="px-3 py-2 text-center">GP</th>
            <th className="px-3 py-2 text-center">GC</th>
            <th className="px-3 py-2 text-center">S</th>
            <th className="px-3 py-2 text-center font-black text-blue-700">P</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const pos = i + 1
            const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `${pos}°`
            const rowCls = pos === 1 ? 'bg-yellow-50' : pos === 2 ? 'bg-gray-50' : pos === 3 ? 'bg-orange-50/50' : ''
            const played = s.J === totalEntries - 1
            return (
              <tr key={s.team.id} className={`border-t border-gray-100 ${rowCls}`}>
                <td className="px-3 py-2.5 text-center font-black text-lg">{medal}</td>
                <td className="px-3 py-2.5 font-semibold">
                  {s.team.player1} / {s.team.player2}
                  {played && <span className="ml-2 text-xs text-gray-400">(completo)</span>}
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">{s.J}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-green-700">{s.V}</td>
                <td className="px-3 py-2.5 text-center text-gray-500">{s.E}</td>
                <td className="px-3 py-2.5 text-center text-red-500">{s.D}</td>
                <td className="px-3 py-2.5 text-center">{s.GP}</td>
                <td className="px-3 py-2.5 text-center">{s.GC}</td>
                <td className={`px-3 py-2.5 text-center font-semibold ${s.S > 0 ? 'text-green-600' : s.S < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {s.S > 0 ? `+${s.S}` : s.S}
                </td>
                <td className="px-3 py-2.5 text-center font-black text-blue-700 text-base">{s.P}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TOURNAMENT MATCH ROW
// ════════════════════════════════════════════════════════════════
function TournamentMatchRow({ match, seedA, seedB, courts, onAction }) {
  const [sA, setSA] = useState(String(match.scoreA))
  const [sB, setSB] = useState(String(match.scoreB))
  const [courtId, setCourtId] = useState(match.courtId || '')

  useEffect(() => { setSA(String(match.scoreA)); setSB(String(match.scoreB)) }, [match.scoreA, match.scoreB])

  const st    = STATUS_STYLE[match.status] || STATUS_STYLE.waiting
  const nameA = match.teamA ? `${match.teamA.player1} / ${match.teamA.player2}` : 'A definir'
  const nameB = match.teamB ? `${match.teamB.player1} / ${match.teamB.player2}` : 'A definir'
  const isCalled = !!match.calledAt

  return (
    <div className={`rounded-xl border-l-4 px-4 py-3 flex flex-wrap items-center gap-3 bg-gray-50 ${st.border}`}>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${st.bg}`}>{st.label}</span>

      <div className="flex-1 min-w-0">
        <span className="font-black text-blue-700 text-sm">{seedA ? `${seedA} — ` : ''}{nameA}</span>
        <span className="text-gray-400 mx-2 text-xs">VS</span>
        <span className="font-black text-red-700 text-sm">{seedB ? `${seedB} — ` : ''}{nameB}</span>
        {match.winnerTeamId && (
          <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 font-bold px-1.5 rounded">
            🏆 {match.winnerTeamId === match.teamAId ? nameA : nameB}
          </span>
        )}
      </div>

      {match.status === 'finished' && (
        <div className="font-black text-2xl shrink-0 flex items-center gap-2">
          <span className="text-blue-700">{match.scoreA}</span>
          <span className="text-gray-300">×</span>
          <span className="text-red-700">{match.scoreB}</span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {match.status !== 'finished' && (
          <select value={courtId} onChange={e => setCourtId(e.target.value)}
            disabled={courts.length === 0}
            className={`input text-xs py-1.5 max-w-32 ${courts.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <option value="">{courts.length === 0 ? 'Sem quadras' : 'Quadra'}</option>
            {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {match.status === 'waiting' && (
          <>
            <Btn color="orange"
              disabled={!courtId}
              title={!courtId ? 'Selecione uma quadra primeiro' : ''}
              onClick={async () => {
                if (courtId) await onAction(match.id, 'court', { courtId })
                await onAction(match.id, 'call')
              }}>📢 Chamar</Btn>
            <Btn color="green" onClick={() => onAction(match.id, 'start')}>▶ Iniciar</Btn>
          </>
        )}

        {match.status === 'playing' && (
          <>
            <Btn color="blue" onClick={() => onAction(match.id, 'score', { team: 'A' })}>+1 A</Btn>
            <Btn color="red"  onClick={() => onAction(match.id, 'score', { team: 'B' })}>+1 B</Btn>
            <Btn color="gray" onClick={() => onAction(match.id, 'undo')}>↩</Btn>
            <div className="flex items-center border rounded-lg overflow-hidden bg-white">
              <input type="number" min="0" value={sA} onChange={e => setSA(e.target.value)}
                className="w-10 text-center text-sm py-1.5 border-r outline-none font-bold text-blue-700" />
              <span className="px-1 text-gray-400 text-xs">×</span>
              <input type="number" min="0" value={sB} onChange={e => setSB(e.target.value)}
                className="w-10 text-center text-sm py-1.5 border-l outline-none font-bold text-red-700" />
            </div>
            <Btn color="orange" onClick={() => onAction(match.id, 'finish', { scoreA: +sA, scoreB: +sB })}>■ Finalizar</Btn>
          </>
        )}

        {isCalled && match.status === 'waiting' && (
          <span className="text-xs bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full animate-pulse">📢 Na TV</span>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// STANDALONE MATCH CARD
// ════════════════════════════════════════════════════════════════
function MatchCard({ match, onAction }) {
  const [sA, setSA] = useState(String(match.scoreA))
  const [sB, setSB] = useState(String(match.scoreB))
  useEffect(() => { setSA(String(match.scoreA)); setSB(String(match.scoreB)) }, [match.scoreA, match.scoreB])

  const st     = STATUS_STYLE[match.status] || STATUS_STYLE.waiting
  const nA     = teamName(match.teamA), nB = teamName(match.teamB)
  const isCalled = !!match.calledAt

  return (
    <div className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${st.border}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.bg}`}>{st.label}</span>
            {match.position > 0 && <span className="text-xs bg-gray-100 text-gray-600 font-mono font-bold px-2 py-0.5 rounded-full">#{match.position}</span>}
            {match.court    && <span className="text-xs text-gray-400 font-medium">{match.court.name}</span>}
            {match.category && <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">{match.category}</span>}
            {isCalled && match.status === 'waiting' && <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-2 py-0.5 rounded-full animate-pulse">📢 Na TV</span>}
          </div>
          <div className="text-base font-semibold">
            {match.teamA ? <span className={`text-blue-700 ${match.winnerTeamId === match.teamAId ? 'font-black' : ''}`}>{match.winnerTeamId === match.teamAId ? '🏆 ' : ''}{nA}</span> : <span className="text-gray-400 italic">A definir</span>}
            <span className="text-gray-400 mx-2">vs</span>
            {match.teamB ? <span className={`text-red-700 ${match.winnerTeamId === match.teamBId ? 'font-black' : ''}`}>{match.winnerTeamId === match.teamBId ? '🏆 ' : ''}{nB}</span> : <span className="text-gray-400 italic">A definir</span>}
          </div>
          {match.nextMatchId && <p className="text-xs text-gray-400 mt-1">→ vencedor avança automaticamente</p>}
        </div>

        {match.status !== 'waiting' && (
          <div className="flex items-center gap-3 text-3xl font-black shrink-0">
            <span className="text-blue-700">{match.scoreA}</span>
            <span className="text-gray-300">—</span>
            <span className="text-red-700">{match.scoreB}</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {match.status === 'waiting' && (
            <>
              <Btn color="orange" onClick={() => onAction(match.id, 'call')} disabled={!match.teamA || !match.teamB || !match.courtId} title={!match.courtId ? 'Selecione uma quadra primeiro' : ''}>📢 Chamar</Btn>
              <Btn color="green"  onClick={() => onAction(match.id, 'start')} disabled={!match.teamA || !match.teamB}>▶ Iniciar</Btn>
            </>
          )}
          {match.status === 'playing' && (
            <>
              <Btn color="blue"   onClick={() => onAction(match.id, 'score', { team: 'A' })}>+1 Dupla A</Btn>
              <Btn color="red"    onClick={() => onAction(match.id, 'score', { team: 'B' })}>+1 Dupla B</Btn>
              <Btn color="gray"   onClick={() => onAction(match.id, 'undo')}>↩ Desfazer</Btn>
              <div className="flex items-center border rounded-lg overflow-hidden bg-white">
                <input type="number" min="0" value={sA} onChange={e => setSA(e.target.value)} className="w-12 text-center text-sm py-2 border-r outline-none font-bold text-blue-700" />
                <span className="px-1 text-gray-400 text-xs">×</span>
                <input type="number" min="0" value={sB} onChange={e => setSB(e.target.value)} className="w-12 text-center text-sm py-2 border-l outline-none font-bold text-red-700" />
              </div>
              <Btn color="orange" onClick={() => onAction(match.id, 'finish', { scoreA: +sA, scoreB: +sB })}>■ Finalizar</Btn>
            </>
          )}
          {match.status === 'finished' && (
            <span className="text-sm text-gray-400 italic">{match.winnerTeam ? `🏆 ${teamName(match.winnerTeam)}` : 'Encerrada'}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ImportResult ──────────────────────────────────────────────────
function ImportResult({ result }) {
  const ok = result.ok !== false
  return (
    <div className={`rounded-lg p-4 text-sm border ${ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      {ok
        ? <p className="font-bold text-green-800 mb-2">✅ {result.imported} de {result.total} partidas importadas</p>
        : <p className="font-bold text-red-800 mb-2">❌ {result.error}</p>
      }
      {result.missing?.length > 0 && (
        <div className="mb-3">
          <p className="font-semibold text-red-700 mb-1">Colunas obrigatórias não encontradas:</p>
          <ul className="text-red-600 space-y-0.5 ml-2">{result.missing.map((m, i) => <li key={i}>• {m}</li>)}</ul>
          {result.hint && <p className="text-gray-600 mt-2 italic">{result.hint}</p>}
        </div>
      )}
      {result.columnMap && Object.keys(result.columnMap).length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-gray-500 font-medium select-none">Colunas detectadas ({Object.keys(result.columnMap).length})</summary>
          <table className="mt-2 text-xs w-full">
            <thead><tr className="text-gray-500"><th className="text-left pr-4">Seu Excel</th><th className="text-left">Interpretado como</th></tr></thead>
            <tbody>{Object.entries(result.columnMap).map(([o, m]) => (
              <tr key={o} className={o === m ? 'text-gray-400' : 'text-green-700 font-semibold'}>
                <td className="pr-4 py-0.5 font-mono">{o}</td><td className="py-0.5 font-mono">{m}</td>
              </tr>
            ))}</tbody>
          </table>
        </details>
      )}
      {result.errors?.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-red-500 font-medium select-none">{result.errors.length} erro(s) em linhas</summary>
          <ul className="mt-1 text-red-600 space-y-0.5 text-xs ml-2">{result.errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>
        </details>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// CONFIRM MODAL
// ════════════════════════════════════════════════════════════════
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">🗑</span>
          <p className="text-gray-800 font-semibold text-base leading-snug">{message}</p>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel}
            className="px-5 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="px-5 py-2 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all">
            Excluir
          </button>
        </div>
      </div>
    </div>
  )
}

function useConfirm() {
  const [state, setState] = useState(null) // { message, resolve }

  const confirm = (message) => new Promise(resolve => setState({ message, resolve }))

  const handleConfirm = () => { state?.resolve(true);  setState(null) }
  const handleCancel  = () => { state?.resolve(false); setState(null) }

  const modal = state
    ? <ConfirmModal message={state.message} onConfirm={handleConfirm} onCancel={handleCancel} />
    : null

  return { confirm, modal }
}

// ════════════════════════════════════════════════════════════════
// COPA DO MUNDO TAB (FFA)
// ════════════════════════════════════════════════════════════════
const FFA_COLORS = ['Verde', 'Amarelo', 'Azul', 'Branco']

const COLOR_STYLE = {
  Verde:   { bg: 'bg-green-500',  text: 'text-white',    light: 'bg-green-50  text-green-800  border-green-200'  },
  Amarelo: { bg: 'bg-yellow-400', text: 'text-gray-900', light: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  Azul:    { bg: 'bg-blue-600',   text: 'text-white',    light: 'bg-blue-50   text-blue-800   border-blue-200'   },
  Branco:  { bg: 'bg-gray-200',   text: 'text-gray-700', light: 'bg-gray-50   text-gray-700   border-gray-300'   },
}

function ffaStandings(tournament) {
  const teamColor = new Map(tournament.entries.map(e => [e.teamId, e.colorTeam]))
  const s = {}
  for (const c of FFA_COLORS) s[c] = { colorTeam: c, wins: 0, losses: 0, draws: 0, played: 0 }
  for (const m of tournament.matches) {
    if (m.status !== 'finished') continue
    const cA = teamColor.get(m.teamAId), cB = teamColor.get(m.teamBId)
    if (!cA || !cB || !s[cA] || !s[cB]) continue
    s[cA].played++; s[cB].played++
    if (m.scoreA > m.scoreB)      { s[cA].wins++;  s[cB].losses++ }
    else if (m.scoreB > m.scoreA) { s[cB].wins++;  s[cA].losses++ }
    else                          { s[cA].draws++; s[cB].draws++  }
  }
  return Object.values(s).sort((a, b) => b.wins - a.wins)
}

function CopaTab({ tournaments, teams, courts, onReload, notify }) {
  const [name, setName]     = useState('')
  const [selected, setSelected] = useState(null)
  const { confirm, modal: confirmModal } = useConfirm()

  const createFfa = async (e) => {
    e.preventDefault()
    try {
      await api.post('/tournaments', { name: name.trim(), type: 'ffa' })
      setName(''); onReload(); notify('Copa do Mundo criada!')
    } catch (err) { notify(err.message, 'err') }
  }

  const deleteFfa = async (t) => {
    if (!await confirm(`Excluir "${t.name}" e todas as partidas?`)) return
    try {
      await authFetch(`${API_URL}/tournaments/${t.id}`, { method: 'DELETE' })
      onReload(); notify('Excluído.')
      if (selected?.id === t.id) setSelected(null)
    } catch (err) { notify(err.message, 'err') }
  }

  const live = selected ? (tournaments.find(t => t.id === selected.id) || null) : null

  return (
    <>
      <Card title="Nova Copa do Mundo (FFA)">
        <p className="text-xs text-gray-400 mb-3">
          Formato: 4 times (Verde, Amarelo, Azul, Branco) jogam em grupos por categoria.
          O time com mais vitórias vence o torneio.
        </p>
        <form onSubmit={createFfa} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nome do Evento</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Copa do Mundo BT 2026" required className="input w-full" />
          </div>
          <Btn type="submit" color="blue">Criar</Btn>
        </form>
      </Card>

      {tournaments.length === 0 && <Empty msg="Nenhuma Copa do Mundo criada." />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tournaments.map(t => {
          const ranked = ffaStandings(t)
          const done = t.matches.filter(m => m.status === 'finished').length
          return (
            <div key={t.id} onClick={() => setSelected(t)}
              className={`rounded-2xl border-2 overflow-hidden cursor-pointer hover:shadow-lg transition-all ${
                live?.id === t.id ? 'border-blue-500' : 'border-gray-200'
              }`}>
              <div className="bg-gray-900 text-white px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-black text-base">{t.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t.entries.length} duplas · {done}/{t.matches.length} partidas
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-purple-600 text-white font-bold px-2 py-0.5 rounded-full">FFA</span>
                  <button onClick={e => { e.stopPropagation(); deleteFfa(t) }}
                    className="text-gray-400 hover:text-red-400 transition-colors text-lg px-1">🗑</button>
                </div>
              </div>
              <div className="bg-white px-4 py-4">
                <div className="flex gap-2">
                  {ranked.map(({ colorTeam, wins, played }, i) => {
                    const s = COLOR_STYLE[colorTeam]
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}°`
                    return (
                      <div key={colorTeam} className={`flex-1 rounded-xl border px-2 py-2 text-center ${s.light}`}>
                        <div className={`text-xs font-black px-1 py-0.5 rounded-full inline-block mb-1 ${s.bg} ${s.text}`}>{colorTeam}</div>
                        <div className="text-xl font-black">{wins}</div>
                        <div className="text-xs text-gray-400">{played > 0 ? `${played}j` : '—'}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {live && (
        <FfaDetail
          tournament={live}
          teams={teams}
          courts={courts}
          onReload={onReload}
          notify={notify}
          onClose={() => setSelected(null)}
        />
      )}
      {confirmModal}
    </>
  )
}

// ── printFfaMatches ────────────────────────────────────────────────
function printFfaMatches(tournament, matches, teamColor) {
  const STATUS_LABEL = { waiting: 'Aguardando', playing: 'Em Jogo', finished: 'Finalizada' }
  const COLOR_HEX = { Verde: '#16a34a', Amarelo: '#ca8a04', Azul: '#2563eb', Branco: '#6b7280' }

  // Agrupa por categoria
  const byCategory = {}
  for (const m of matches) {
    const cat = m.category || 'Sem categoria'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(m)
  }

  const rows = Object.entries(byCategory).map(([cat, ms]) => {
    const matchRows = ms.map((m, i) => {
      const cA = teamColor.get(m.teamAId) || ''
      const cB = teamColor.get(m.teamBId) || ''
      const nameA = m.teamA ? `${m.teamA.player1} / ${m.teamA.player2}` : 'A definir'
      const nameB = m.teamB ? `${m.teamB.player1} / ${m.teamB.player2}` : 'A definir'
      const hexA = COLOR_HEX[cA] || '#000'
      const hexB = COLOR_HEX[cB] || '#000'
      const score = m.status === 'finished' ? `${m.scoreA}×${m.scoreB}` : '  ×  '
      const bg = i % 2 === 0 ? '' : 'background:#f3f4f6'
      return `<tr style="${bg}">
        <td style="color:#aaa;width:20px;text-align:center">${m.position || ''}</td>
        <td style="text-align:right;white-space:nowrap">
          <b style="color:${hexA}">[${cA}]</b> ${nameA}
        </td>
        <td style="text-align:center;font-weight:900;color:#444;width:55px;white-space:nowrap">${score}</td>
        <td style="text-align:left;white-space:nowrap">
          ${nameB} <b style="color:${hexB}">[${cB}]</b>
        </td>
      </tr>`
    }).join('')

    return `<div style="margin-bottom:8px">
      <div style="background:#1e293b;color:#fff;padding:2px 8px;font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:.05em">${cat}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>${matchRows}</tbody></table>
    </div>`
  }).join('')

  const done  = matches.filter(m => m.status === 'finished').length
  const total = matches.length

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${tournament.name}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 12px; color: #111; }
      td { padding: 2px 4px; }
      @media print { body { padding: 4px; } }
    </style>
  </head><body>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;border-bottom:2px solid #1e293b;padding-bottom:4px">
      <b style="font-size:15px">${tournament.name}</b>
      <span style="font-size:10px;color:#888">${done}/${total} finalizadas · ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
    ${rows}
  </body></html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

// ── FfaDetail ──────────────────────────────────────────────────────
function FfaDetail({ tournament, teams, courts, onReload, notify, onClose }) {
  const [tab, setTab]           = useState('times')
  const [activeColor, setActiveColor] = useState('Verde')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [dropOpen, setDropOpen]   = useState(false)
  const [generating, setGenerating] = useState(false)
  const [colorFilter, setColorFilter] = useState('')
  const [catFilter, setCatFilter]     = useState('')
  const dropRef = useRef(null)
  const { confirm, modal: confirmModal } = useConfirm()

  const action = async (id, act, body = {}) => {
    try {
      const res = await api.post(`/matches/${id}/${act}`, body)
      onReload()
      if (act === 'call') notify('📢 Chamada enviada para a TV!')
      if (act === 'mark-next') notify(res.isNext ? '📌 Marcado como próxima!' : 'Desmarcado.')
    } catch (err) { notify(err.message, 'err') }
  }

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!dropOpen) return
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [dropOpen])

  // Reset seleção ao trocar de cor
  useEffect(() => { setSelectedIds(new Set()); setDropOpen(false) }, [activeColor])

  const addBatch = async () => {
    if (selectedIds.size === 0) return
    try {
      const res = await api.post(`/tournaments/${tournament.id}/ffa-batch-teams`, {
        colorTeam: activeColor,
        teamIds:   [...selectedIds],
      })
      setSelectedIds(new Set()); setDropOpen(false)
      onReload()
      notify(`${selectedIds.size} dupla(s) adicionadas ao Time ${activeColor}!`)
    } catch (err) { notify(err.message, 'err') }
  }

  const removeDupla = async (teamId) => {
    try {
      await authFetch(`${API_URL}/tournaments/${tournament.id}/ffa-teams/${teamId}`, { method: 'DELETE' })
      onReload(); notify('Dupla removida.')
    } catch (err) { notify(err.message, 'err') }
  }

  const autoGenerate = async () => {
    const hasMatches = tournament.matches.some(m => !['semi','final','terceiro lugar'].includes(m.round))
    if (hasMatches && !await confirm('Isso vai apagar os grupos existentes e recriar tudo. Continuar?')) return
    setGenerating(true)
    try {
      const res = await api.post(`/tournaments/${tournament.id}/ffa-auto-generate`, {})
      onReload()
      notify(`✅ ${res.matchesCreated} partidas criadas!`)
      setTab('partidas')
    } catch (err) { notify(err.message, 'err') }
    finally { setGenerating(false) }
  }

  const generateFinals = async () => {
    try {
      await api.post(`/tournaments/${tournament.id}/ffa-finals`, {})
      onReload(); notify('Final gerada!')
    } catch (err) { notify(err.message, 'err') }
  }

  const teamColor = new Map(tournament.entries.map(e => [e.teamId, e.colorTeam]))
  const ranked    = ffaStandings(tournament)

  // Duplas already assigned to each color
  const byColor = {}
  for (const c of FFA_COLORS) byColor[c] = tournament.entries.filter(e => e.colorTeam === c)

  // Teams NOT yet in this tournament, filtered by the active color tag
  const assignedIds = new Set(tournament.entries.map(e => e.teamId))
  const available   = teams.filter(t => !assignedIds.has(t.id) && t.colorTeam === activeColor)

  const FINALS_ROUNDS = ['semi', 'final', 'terceiro lugar']
  const finalMatches  = tournament.matches.filter(m => FINALS_ROUNDS.includes(m.round))
  const regularMatches = tournament.matches.filter(m => !FINALS_ROUNDS.includes(m.round))
  const flatMatches = [...regularMatches].sort((a, b) => {
    const finA = a.status === 'finished' ? 1 : 0
    const finB = b.status === 'finished' ? 1 : 0
    return finA !== finB ? finA - finB : a.position - b.position
  })
  const categories = [...new Set(regularMatches.map(m => m.category).filter(Boolean))]

  const done  = tournament.matches.filter(m => m.status === 'finished').length
  const total = tournament.matches.length

  // Count per color for summary
  const colorCount = {}
  for (const c of FFA_COLORS) colorCount[c] = byColor[c].length

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200">
      <div className="sticky top-0 z-20 rounded-t-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">{tournament.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {tournament.entries.length} duplas · {done}/{total} partidas
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {total === 0 && tournament.entries.length > 0 && (
            <Btn color="green" disabled={generating} onClick={autoGenerate}>
              {generating ? '⏳ Gerando...' : '⚡ Gerar Todos os Jogos'}
            </Btn>
          )}
          {total > 0 && (
            <>
              <Btn color="blue" onClick={generateFinals}>🏆 Gerar Final</Btn>
              <Btn color="gray" disabled={generating} onClick={autoGenerate}>
                {generating ? '⏳...' : '🔄 Regerar Jogos'}
              </Btn>
              <Btn color="gray" onClick={() => printFfaMatches(tournament, flatMatches, teamColor)}>🖨️ Imprimir</Btn>
            </>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
      </div>

      {/* Standings (só aparece se há partidas) */}
      {total > 0 && (
        <div className="px-6 py-4 border-b border-gray-100 bg-white">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">Placar Geral dos Times</h3>
          <div className="grid grid-cols-4 gap-3">
            {ranked.map(({ colorTeam, wins, losses, draws, played }, i) => {
              const s = COLOR_STYLE[colorTeam]
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}°`
              return (
                <div key={colorTeam} className={`rounded-xl border p-3 text-center ${s.light}`}>
                  <div className={`text-xs font-black px-2 py-0.5 rounded-full inline-block mb-2 ${s.bg} ${s.text}`}>
                    {medal} {colorTeam}
                  </div>
                  <div className="text-3xl font-black">{wins}</div>
                  <div className="text-xs text-gray-400">vitórias</div>
                  {played > 0 && <div className="text-xs text-gray-400 mt-0.5">{draws}E · {losses}D</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      </div>{/* /sticky */}

      {/* Hint quando não há partidas */}
      {total === 0 && tournament.entries.length > 0 && (
        <div className="mx-6 mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
          <span className="font-bold">Próximo passo:</span> clique em <strong>"⚡ Gerar Todos os Jogos"</strong> para criar automaticamente todos os grupos e partidas.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-6 mt-4">
        {[['times', 'Times'], ['partidas', 'Partidas']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
              tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>{label}</button>
        ))}
      </div>

      <div className="p-6">

        {/* ── ABA: TIMES ── */}
        {tab === 'times' && (
          <div className="space-y-5">
            {/* Seletor de cor ativa */}
            <div className="flex gap-2 flex-wrap">
              {FFA_COLORS.map(color => {
                const s = COLOR_STYLE[color]
                const cnt = colorCount[color]
                return (
                  <button key={color} onClick={() => setActiveColor(color)}
                    className={`px-4 py-2 rounded-xl font-black text-sm border-2 transition-all ${
                      activeColor === color
                        ? `${s.bg} ${s.text} border-transparent shadow-md scale-105`
                        : 'border-gray-200 text-gray-500 hover:border-gray-400 bg-white'
                    }`}>
                    {color}
                    <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      activeColor === color ? 'bg-white/30' : 'bg-gray-100 text-gray-500'
                    }`}>{cnt}</span>
                  </button>
                )
              })}
            </div>

            {/* Adicionar duplas ao time ativo */}
            {(() => {
              const s = COLOR_STYLE[activeColor]
              return (
                <div className={`rounded-2xl border p-4 ${s.light}`}>
                  <div className={`text-xs font-black px-2 py-0.5 rounded-full inline-block mb-3 ${s.bg} ${s.text}`}>
                    Time {activeColor} — {colorCount[activeColor]} dupla(s)
                  </div>

                  {/* Multi-select dropdown */}
                  <div className="flex gap-3 items-start mb-4">
                    <div className="flex-1 relative" ref={dropRef}>
                      <button type="button"
                        onClick={() => available.length > 0 && setDropOpen(v => !v)}
                        disabled={available.length === 0}
                        className="input w-full text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed">
                        <span className={selectedIds.size > 0 ? 'text-gray-800 text-sm' : 'text-gray-400 text-sm'}>
                          {available.length === 0
                            ? 'Nenhuma dupla disponível'
                            : selectedIds.size > 0
                              ? `${selectedIds.size} dupla(s) selecionada(s)`
                              : `Selecionar duplas (${available.length} disponíveis)...`}
                        </span>
                        <span className="text-gray-400 ml-2">{dropOpen ? '▲' : '▼'}</span>
                      </button>

                      {dropOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                          {/* Selecionar todos */}
                          <label className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-200 sticky top-0 bg-white">
                            <input type="checkbox"
                              checked={available.length > 0 && selectedIds.size === available.length}
                              onChange={() => {
                                if (selectedIds.size === available.length) setSelectedIds(new Set())
                                else setSelectedIds(new Set(available.map(t => t.id)))
                              }}
                              className="accent-blue-600 w-4 h-4 shrink-0" />
                            <span className="font-black text-gray-600">Selecionar todos ({available.length})</span>
                          </label>
                          {available.map(t => {
                            const checked = selectedIds.has(t.id)
                            return (
                              <label key={t.id}
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50 last:border-0">
                                <input type="checkbox" checked={checked}
                                  onChange={() => setSelectedIds(prev => {
                                    const next = new Set(prev)
                                    checked ? next.delete(t.id) : next.add(t.id)
                                    return next
                                  })}
                                  className="accent-blue-600 w-4 h-4 shrink-0" />
                                <div className="min-w-0">
                                  <span className="font-semibold">{t.player1} / {t.player2}</span>
                                  {t.category && (
                                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${teamCatStyle(t.category)}`}>{t.category}</span>
                                  )}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <Btn color="blue" onClick={addBatch} disabled={selectedIds.size === 0}>
                      {selectedIds.size > 1 ? `Adicionar (${selectedIds.size})` : 'Adicionar'}
                    </Btn>
                  </div>

                  {/* Lista de duplas já no time */}
                  {byColor[activeColor].length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Nenhuma dupla no Time {activeColor} ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                      {byColor[activeColor].map(e => (
                        <div key={e.id}
                          className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 text-xs border border-white/60">
                          <div className="min-w-0">
                            <span className="font-semibold text-gray-800">{e.team.player1} / {e.team.player2}</span>
                            {e.team.category && (
                              <span className={`ml-1.5 text-xs px-1 py-0.5 rounded-full ${teamCatStyle(e.team.category)}`}>{e.team.category}</span>
                            )}
                          </div>
                          <button onClick={() => removeDupla(e.teamId)}
                            className="text-gray-300 hover:text-red-500 ml-2 shrink-0 transition-colors">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Resumo e botão de gerar */}
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-100">
              <div className="flex gap-3 flex-wrap">
                {FFA_COLORS.map(c => {
                  const s = COLOR_STYLE[c]
                  return (
                    <span key={c} className={`text-xs font-bold px-2 py-1 rounded-lg border ${s.light}`}>
                      {c}: {colorCount[c]}
                    </span>
                  )
                })}
              </div>
              <Btn color="green" disabled={generating || tournament.entries.length === 0} onClick={autoGenerate}>
                {generating ? '⏳ Gerando...' : '⚡ Gerar Todos os Jogos'}
              </Btn>
              <span className="text-xs text-gray-400">
                Agrupa automaticamente por categoria e cria 6 partidas por grupo.
              </span>
            </div>
          </div>
        )}

        {/* ── ABA: PARTIDAS ── */}
        {tab === 'partidas' && (
          <>
            {/* Filtros */}
            {flatMatches.length > 0 && (
              <div className="space-y-2 mb-4">
                {/* Filtro por time */}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setColorFilter('')}
                    className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-colors ${
                      !colorFilter ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}>Todos os times</button>
                  {FFA_COLORS.map(c => {
                    const s = COLOR_STYLE[c]
                    const active = colorFilter === c
                    return (
                      <button key={c} onClick={() => setColorFilter(active ? '' : c)}
                        className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-colors ${
                          active ? `${s.bg} ${s.text} border-transparent` : 'border-gray-200 text-gray-500 hover:border-gray-400'
                        }`}>{c}</button>
                    )
                  })}
                </div>
                {/* Filtro por categoria */}
                {categories.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setCatFilter('')}
                      className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-colors ${
                        !catFilter ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}>Todas as categorias</button>
                    {categories.map(c => (
                      <button key={c} onClick={() => setCatFilter(catFilter === c ? '' : c)}
                        className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-colors ${
                          catFilter === c ? `${teamCatStyle(c)} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-400'
                        }`}>{c}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {flatMatches.length === 0 && finalMatches.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">🎾</p>
                <p className="font-semibold">Nenhuma partida ainda.</p>
                <p className="text-sm mt-1">Adicione duplas na aba <strong>Times</strong> e clique em <strong>⚡ Gerar Todos os Jogos</strong>.</p>
              </div>
            )}

            {(() => {
              const visible = flatMatches.filter(m =>
                (!colorFilter || teamColor.get(m.teamAId) === colorFilter || teamColor.get(m.teamBId) === colorFilter) &&
                (!catFilter   || m.category === catFilter)
              )
              if (visible.length === 0 && (colorFilter || catFilter)) return (
                <p className="text-sm text-gray-400 italic text-center py-6">Nenhuma partida encontrada para os filtros selecionados.</p>
              )
              return (
                <div className="space-y-2">
                  {visible.map(m => (
                    <FfaMatchRow
                      key={m.id}
                      match={m}
                      colorA={teamColor.get(m.teamAId)}
                      colorB={teamColor.get(m.teamBId)}
                      courts={courts}
                      entries={tournament.entries}
                      onAction={action}
                      onReload={onReload}
                    />
                  ))}
                </div>
              )
            })()}

            {finalMatches.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black bg-yellow-500 text-white px-2 py-0.5 rounded-full">🏆 FINAL</span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>
                <div className="space-y-2">
                  {finalMatches.sort((a, b) => a.position - b.position).map(m => (
                    <TournamentMatchRow key={m.id} match={m} courts={courts} onAction={action} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {confirmModal}
    </div>
  )
}

// ── FfaMatchRow ───────────────────────────────────────────────────
function FfaMatchRow({ match, colorA, colorB, courts, entries = [], onAction, onReload }) {
  const [sA, setSA]       = useState(String(match.scoreA))
  const [sB, setSB]       = useState(String(match.scoreB))
  const [courtId, setCourtId] = useState(match.courtId || '')
  const [pos, setPos]     = useState(String(match.position ?? ''))
  const [swapping, setSwapping] = useState(false)
  const [swapA, setSwapA] = useState(match.teamAId || '')
  const [swapB, setSwapB] = useState(match.teamBId || '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setSA(String(match.scoreA)); setSB(String(match.scoreB))
    setCourtId(match.courtId || '')
    setPos(String(match.position ?? ''))
    setSwapA(match.teamAId || '')
    setSwapB(match.teamBId || '')
  }, [match.scoreA, match.scoreB, match.courtId, match.position, match.teamAId, match.teamBId])

  const saveSwap = async () => {
    try {
      await api.post(`/matches/${match.id}/set-teams`, {
        teamAId: swapA || null,
        teamBId: swapB || null,
      })
      setSwapping(false)
      onReload()
    } catch {}
  }

  const savePos = async () => {
    const n = parseInt(pos)
    if (isNaN(n) || n === match.position) return
    try { await api.put(`/matches/${match.id}/position`, { position: n }); onReload() }
    catch { setPos(String(match.position ?? '')) }
  }

  const nameA = match.teamA ? `${match.teamA.player1} / ${match.teamA.player2}` : 'A definir'
  const nameB = match.teamB ? `${match.teamB.player1} / ${match.teamB.player2}` : 'A definir'
  const winA  = match.winnerTeamId === match.teamAId
  const winB  = match.winnerTeamId === match.teamBId
  const sA_cs = colorA ? COLOR_STYLE[colorA] : null
  const sB_cs = colorB ? COLOR_STYLE[colorB] : null

  const topBg = match.status === 'playing' ? 'bg-green-600' : match.status === 'finished' ? 'bg-gray-500' : 'bg-gray-700'

  return (
    <div className={`rounded-xl border overflow-hidden ${match.status === 'playing' ? 'border-green-300' : 'border-gray-200'}`}>
      <div className={`flex items-center gap-2 px-3 py-1.5 ${topBg} text-white text-xs`}>
        {match.isNext ? (
          <span className="font-black bg-purple-500 px-2 py-0.5 rounded-full animate-pulse">📌 Próxima</span>
        ) : (
          <span className={`font-semibold ${match.status === 'playing' ? 'text-green-100' : match.status === 'finished' ? 'text-gray-200' : 'text-amber-300'}`}>
            {match.status === 'playing' ? '● Em Jogo' : match.status === 'finished' ? '✓ Finalizada' : '○ Aguardando'}
          </span>
        )}
        {match.status === 'finished' && (
          <button
            onClick={() => { setEditing(e => !e); setSA(String(match.scoreA)); setSB(String(match.scoreB)) }}
            title="Editar placar"
            className={`ml-1 px-2 py-0.5 text-xs font-semibold rounded transition-colors ${editing ? 'bg-white text-gray-800' : 'bg-white/20 hover:bg-white/30 text-white'}`}>
            ✏️
          </button>
        )}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <span className="text-white/50">#</span>
          <input
            type="number" min="1" value={pos}
            onChange={e => setPos(e.target.value)}
            onBlur={savePos}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            className="w-10 text-center bg-white/20 hover:bg-white/30 focus:bg-white/30 rounded text-white font-bold outline-none text-xs py-0.5"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-white">
        <div className="flex-1 text-right">
          {sA_cs && <span className={`text-xs font-black px-1.5 py-0.5 rounded-full mr-1 ${sA_cs.bg} ${sA_cs.text}`}>{colorA}</span>}
          <span className={`text-xs font-semibold ${winA ? 'text-green-700 font-black' : 'text-gray-700'}`}>
            {winA && '🏆 '}{nameA}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {match.status === 'playing' && (
            <button onClick={() => onAction(match.id, 'score', { team: 'A' })}
              className="w-6 h-6 bg-blue-600 text-white rounded text-xs font-black hover:bg-blue-700 active:scale-95">+</button>
          )}
          {(match.status !== 'finished' || editing) ? (
            <input type="number" min="0" value={sA} onChange={e => setSA(e.target.value)}
              className="w-8 text-center text-sm font-black border rounded outline-none text-blue-700 py-0.5" />
          ) : (
            <span className={`text-xl font-black w-7 text-center ${winA ? 'text-green-700' : 'text-blue-600'}`}>{match.scoreA}</span>
          )}
          <span className="text-gray-300 font-bold text-sm">×</span>
          {(match.status !== 'finished' || editing) ? (
            <input type="number" min="0" value={sB} onChange={e => setSB(e.target.value)}
              className="w-8 text-center text-sm font-black border rounded outline-none text-red-700 py-0.5" />
          ) : (
            <span className={`text-xl font-black w-7 text-center ${winB ? 'text-green-700' : 'text-red-600'}`}>{match.scoreB}</span>
          )}
          {match.status === 'playing' && (
            <button onClick={() => onAction(match.id, 'score', { team: 'B' })}
              className="w-6 h-6 bg-red-600 text-white rounded text-xs font-black hover:bg-red-700 active:scale-95">+</button>
          )}
        </div>

        <div className="flex-1">
          <span className={`text-xs font-semibold ${winB ? 'text-green-700 font-black' : 'text-gray-700'}`}>
            {winB && '🏆 '}{nameB}
          </span>
          {sB_cs && <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ml-1 ${sB_cs.bg} ${sB_cs.text}`}>{colorB}</span>}
        </div>
      </div>

      {editing && match.status === 'finished' && (
        <div className="flex items-center gap-2 px-3 pb-2 bg-white">
          <span className="text-xs text-gray-400">Corrigir placar</span>
          <button
            onClick={async () => {
              try { await api.post(`/matches/${match.id}/edit`, { scoreA: +sA, scoreB: +sB }); setEditing(false); onReload() }
              catch {}
            }}
            className="px-3 py-1 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 ml-auto">
            Salvar
          </button>
          <button
            onClick={() => { setEditing(false); setSA(String(match.scoreA)); setSB(String(match.scoreB)) }}
            className="px-3 py-1 text-xs font-semibold bg-white text-gray-500 border border-gray-300 rounded hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      )}

      {match.status !== 'finished' && (
        <div className="flex items-center gap-2 px-3 pb-2 bg-white flex-wrap">
          <select
            value={courtId}
            onChange={e => { const v = e.target.value; setCourtId(v); onAction(match.id, 'court', { courtId: v || null }) }}
            disabled={courts.length === 0}
            className={`text-xs py-1 px-2 rounded border outline-none ${courtId ? 'border-blue-400 bg-blue-600 text-white font-semibold' : 'border-gray-300 text-gray-500 bg-white'}`}
          >
            <option value="">{courts.length === 0 ? 'Sem quadras' : '🏖 Quadra...'}</option>
            {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {match.status === 'waiting' && (
            <>
              <button onClick={() => onAction(match.id, 'mark-next')}
                title={match.isNext ? 'Desmarcar' : 'Marcar como próxima'}
                className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                  match.isNext ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-400 border-gray-200 hover:border-purple-400 hover:text-purple-600'
                }`}>📌</button>
              <button
                onClick={() => setSwapping(s => !s)}
                title="Trocar duplas"
                className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                  swapping ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-400 border-gray-200 hover:border-amber-400 hover:text-amber-600'
                }`}>✏️</button>
              <button onClick={() => onAction(match.id, 'call')}
                disabled={!courtId}
                className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${!courtId ? 'opacity-40 cursor-not-allowed bg-gray-100 text-gray-400' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
                📢 Chamar
              </button>
              <button onClick={() => onAction(match.id, 'start')}
                className="px-2 py-1 text-xs font-semibold rounded bg-green-600 text-white hover:bg-green-700">▶ Iniciar</button>
            </>
          )}
          {match.status === 'playing' && (
            <button onClick={() => onAction(match.id, 'undo')}
              className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-600 hover:bg-gray-200">↩</button>
          )}
          <button onClick={() => onAction(match.id, 'finish', { scoreA: +sA, scoreB: +sB })}
            className="px-2.5 py-1 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 active:scale-95 ml-auto">
            ■ Finalizar
          </button>
        </div>
      )}

      {/* Painel de troca de duplas */}
      {swapping && match.status === 'waiting' && (
        <div className="px-3 pb-3 bg-amber-50 border-t border-amber-200">
          <p className="text-xs font-bold text-amber-700 mt-2 mb-2">Trocar duplas</p>
          <div className="flex flex-col gap-2">
            {[['A', swapA, setSwapA, colorA], ['B', swapB, setSwapB, colorB]].map(([side, val, setVal, color]) => {
              const sideEntries = entries.length > 0
                ? [...entries].sort((a, b) => {
                    if (a.colorTeam === color && b.colorTeam !== color) return -1
                    if (b.colorTeam === color && a.colorTeam !== color) return 1
                    return 0
                  })
                : []
              return (
                <div key={side} className="flex items-center gap-2">
                  <span className={`text-xs font-black w-4 text-center ${side === 'A' ? 'text-blue-600' : 'text-red-600'}`}>{side}</span>
                  <select
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    className="flex-1 text-xs border border-amber-300 rounded px-2 py-1 outline-none bg-white"
                  >
                    <option value="">— sem dupla —</option>
                    {sideEntries.map(e => (
                      <option key={e.teamId} value={e.teamId}>
                        [{e.colorTeam}] {e.team?.player1} / {e.team?.player2}{e.team?.category ? ` (${e.team.category})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
            <div className="flex gap-2 mt-1">
              <button onClick={saveSwap}
                className="px-3 py-1 text-xs font-bold bg-amber-500 text-white rounded hover:bg-amber-600">
                Salvar
              </button>
              <button onClick={() => { setSwapping(false); setSwapA(match.teamAId || ''); setSwapB(match.teamBId || '') }}
                className="px-3 py-1 text-xs font-semibold bg-white text-gray-500 border border-gray-300 rounded hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h2 className="text-base font-bold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  )
}
function Empty({ msg }) { return <p className="text-sm text-gray-400 italic">{msg}</p> }

const BTN_COLORS = {
  blue:   'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white',
  red:    'bg-red-600 hover:bg-red-700 text-white',
  green:  'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white',
  gray:   'bg-gray-500 hover:bg-gray-600 text-white',
  orange: 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white',
}
function Btn({ color = 'blue', children, type = 'button', onClick, disabled = false, title }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${BTN_COLORS[color]}`}>
      {children}
    </button>
  )
}
