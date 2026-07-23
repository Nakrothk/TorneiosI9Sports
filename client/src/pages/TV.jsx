import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

const COLOR_TEXT = {
  Verde:   'text-green-400',
  Amarelo: 'text-yellow-300',
  Azul:    'text-blue-400',
  Branco:  'text-white',
}

const ROUND_LABELS = {
  oitavas:          'Oitavas de Final',
  quartas:          'Quartas de Final',
  semi:             'Semifinal',
  final:            'Final',
  'terceiro lugar': 'Disputa 3° Lugar',
}

let _audioCtx = null
function getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _audioCtx
}

function playSound(notes, { type = 'sine', volume = 0.45 } = {}) {
  try {
    const ctx = getAudioCtx()
    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()
    resume.then(() => {
      const master = ctx.createGain()
      master.gain.value = volume
      master.connect(ctx.destination)

      const chime = (freq, startT, dur) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(master)
        osc.type = type
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, startT)
        gain.gain.linearRampToValueAtTime(1, startT + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, startT + dur)
        osc.start(startT)
        osc.stop(startT + dur + 0.05)
      }

      const t = ctx.currentTime
      notes.forEach(([freq, offset, dur]) => chime(freq, t + offset, dur))
    })
  } catch {}
}

function playCallSound() {
  // Arpejo ascendente suave: Dó – Mi – Sol – Dó (oitava acima)
  playSound([
    [523.25, 0.00, 0.6],
    [659.25, 0.18, 0.6],
    [784.00, 0.36, 0.6],
    [1046.5, 0.54, 1.0],
  ])
}

function playNextSound() {
  // Fanfarra turururum: notas rápidas ascendentes com onda quadrada (timbre de trompete)
  playSound([
    [523.25, 0.00, 0.10],
    [659.25, 0.09, 0.10],
    [784.00, 0.18, 0.10],
    [659.25, 0.27, 0.10],
    [784.00, 0.36, 0.10],
    [1046.5, 0.46, 0.55],
  ], { type: 'square', volume: 0.28 })
}

export default function TV() {
  // state: undefined=loading, null=idle, { called, next }=data
  const [data, setData]        = useState(undefined)
  const prevCalledAtRef        = useRef(null)
  const prevNextIdRef          = useRef(null)
  const reminderRef            = useRef(null)
  const [flash, setFlash]      = useState(false)

  const refresh = async () => {
    try {
      const d = await api.get('/matches/tv')

      const calledAt = d.called?.calledAt ?? null
      if (calledAt && calledAt !== prevCalledAtRef.current) {
        prevCalledAtRef.current = calledAt
        setFlash(true)
        setTimeout(() => setFlash(false), 800)
        playCallSound()
        if (reminderRef.current) clearTimeout(reminderRef.current)
        reminderRef.current = setTimeout(() => {
          playCallSound()
          reminderRef.current = null
        }, 15000)
      }

      const nextId = d.next?.id ?? null
      if (nextId && nextId !== prevNextIdRef.current) {
        prevNextIdRef.current = nextId
        playNextSound()
      }
      if (!nextId) prevNextIdRef.current = null

      setData(d)
    } catch {
      // mantém o último estado visível em caso de erro de rede
    }
  }

  useEffect(() => {
    // Desbloqueia AudioContext na primeira interação do usuário
    const unlock = () => { try { getAudioCtx().resume() } catch {} }
    window.addEventListener('click', unlock, { once: true })

    refresh()
    const id = setInterval(refresh, 3000)
    return () => {
      clearInterval(id)
      if (reminderRef.current) clearTimeout(reminderRef.current)
      window.removeEventListener('click', unlock)
    }
  }, [])

  const called = data?.called ?? null
  const next   = data?.next   ?? null

  // Mostrar "próxima" quando não há partida chamada aguardando ir à quadra.
  // Se a partida chamada já está em andamento (playing), a próxima pode aparecer.
  // Chamadas avulsas (quickCall) nunca saem de "waiting" (não têm Iniciar/Finalizar) —
  // então, se uma foi marcada como próxima, ela tem prioridade e substitui a atual.
  const calledIsWaiting = called?.status === 'waiting' && !(called?.quickCall && next)
  const showNext = next && !calledIsWaiting

  return (
    <div
      className={`h-full flex flex-col overflow-hidden transition-colors duration-300 ${
        flash ? 'bg-yellow-300' : 'bg-slate-950'
      }`}
    >
      <div className="flex-1 flex flex-col min-h-0">
        {data === undefined && <Standby label="Carregando..." />}
        {data !== undefined && !calledIsWaiting && !showNext && <Standby label="Aguardando chamada" />}
        {data !== undefined && calledIsWaiting                && <CallCard match={called} showCourt />}
        {data !== undefined && showNext                       && <CallCard match={next}   showCourt={false} />}
      </div>
    </div>
  )
}

/* ─── Tela de espera ──────────────────────────────────────────── */
function Standby({ label }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center select-none">
      <p className="text-7xl mb-6">🎾</p>
      <p className="text-slate-600 text-3xl font-bold tracking-widest uppercase">{label}</p>
    </div>
  )
}

/* ─── Tamanho de fonte adaptativo para nomes longos ───────────── */
function nameFontSize(name) {
  const len = name?.length ?? 0
  if (len > 50) return 'clamp(1.1rem, 2.2vw, 2.4rem)'
  if (len > 40) return 'clamp(1.2rem, 2.6vw, 2.9rem)'
  if (len > 30) return 'clamp(1.4rem, 3.2vw, 3.6rem)'
  if (len > 22) return 'clamp(1.6rem, 3.8vw, 4.5rem)'
  return 'clamp(1.8rem, 4.5vw, 5.5rem)'
}

/* ─── Card de chamada ─────────────────────────────────────────── */
function CallCard({ match, showCourt }) {
  const courtName  = match.court?.name ?? null
  const roundLabel = ROUND_LABELS[match.round?.toLowerCase()] ?? match.round ?? ''

  const parts       = courtName?.match(/^(.*?)(\d+)$/)
  const courtLabel  = parts ? parts[1].trim() || 'Quadra' : courtName
  const courtNumber = parts ? parts[2] : null

  const nameA = match.teamA ? `${match.teamA.player1} / ${match.teamA.player2}` : (match.teamAName || 'A definir')
  const nameB = match.teamB ? `${match.teamB.player1} / ${match.teamB.player2}` : (match.teamBName || 'A definir')

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Fase */}
      {roundLabel && (
        <div className="bg-indigo-700 text-center py-4 px-6 shrink-0">
          <p className="text-white font-black tracking-[0.2em] uppercase" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2.2rem)' }}>{roundLabel}</p>
        </div>
      )}

      {/* Quadra (chamada) ou faixa PRÓXIMO */}
      {showCourt && courtName ? (
        <div className="bg-yellow-400 text-slate-900 text-center py-5 px-6 shrink-0 flex items-center justify-center gap-6">
          <p className="font-black uppercase tracking-[0.3em]" style={{ fontSize: 'clamp(1.8rem, 4.5vw, 5.5rem)' }}>{courtLabel}</p>
          <p className="font-black leading-none" style={{ fontSize: 'clamp(1.8rem, 4.5vw, 5.5rem)' }}>{courtNumber ?? courtName}</p>
        </div>
      ) : !showCourt ? (
        <div className="bg-emerald-600 text-white text-center py-5 px-6 shrink-0">
          <p className="font-black tracking-[0.3em] uppercase" style={{ fontSize: 'clamp(1.6rem, 4vw, 5rem)' }}>Próxima Partida</p>
        </div>
      ) : null}

      {/* Duplas */}
      <div className="bg-slate-900 text-white text-center flex flex-col items-center justify-center flex-1 min-h-0 px-10 gap-2 overflow-hidden">
        <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
          <p className={`font-black leading-tight w-full break-words ${COLOR_TEXT[match.teamA?.colorTeam] ?? 'text-sky-300'}`} style={{ fontSize: nameFontSize(nameA) }}>{nameA}</p>
        </div>
        <p className="font-black text-slate-500 tracking-widest shrink-0" style={{ fontSize: 'clamp(1.5rem, 3.5vw, 4rem)' }}>×</p>
        <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
          <p className={`font-black leading-tight w-full break-words ${COLOR_TEXT[match.teamB?.colorTeam] ?? 'text-rose-300'}`} style={{ fontSize: nameFontSize(nameB) }}>{nameB}</p>
        </div>
      </div>

      {/* Categoria */}
      <div className="bg-slate-800 text-center py-5 px-6 shrink-0">
        {match.category ? (
          <p className="text-slate-200 font-bold tracking-wide" style={{ fontSize: '2rem' }}>{match.category}</p>
        ) : (
          <p className="text-slate-600 text-xl font-medium italic">Sem categoria</p>
        )}
      </div>
    </div>
  )
}
