import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

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

function playCallSound() {
  try {
    const ctx = getAudioCtx()
    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()
    resume.then(() => {
      const master = ctx.createGain()
      master.gain.value = 0.45
      master.connect(ctx.destination)

      const chime = (freq, startT, dur) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(master)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, startT)
        gain.gain.linearRampToValueAtTime(1, startT + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.001, startT + dur)
        osc.start(startT)
        osc.stop(startT + dur + 0.05)
      }

      const t = ctx.currentTime
      // Arpejo suave: Dó – Mi – Sol – Dó (oitava acima)
      chime(523.25, t + 0.00, 0.6)   // C5
      chime(659.25, t + 0.18, 0.6)   // E5
      chime(784.00, t + 0.36, 0.6)   // G5
      chime(1046.5, t + 0.54, 1.0)   // C6 — nota final mais longa
    })
  } catch {}
}

export default function TV() {
  // state: undefined=loading, null=idle, { called, next }=data
  const [data, setData]        = useState(undefined)
  const prevCalledAtRef        = useRef(null)
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
  const calledIsWaiting = called?.status === 'waiting'
  const showNext = next && !calledIsWaiting

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden transition-colors duration-300 ${
        flash ? 'bg-yellow-300' : 'bg-slate-950'
      }`}
    >
      <div className="flex-1 flex flex-col min-h-0">
        {data === undefined && <Standby label="Carregando..." />}
        {data !== undefined && !called && !next   && <Standby label="Aguardando chamada" />}
        {data !== undefined && calledIsWaiting     && <CallCard match={called} showCourt />}
        {data !== undefined && showNext            && <CallCard match={next}   showCourt={false} />}
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

/* ─── Card de chamada ─────────────────────────────────────────── */
function CallCard({ match, showCourt }) {
  const courtName  = match.court?.name ?? null
  const roundLabel = ROUND_LABELS[match.round?.toLowerCase()] ?? match.round ?? ''

  const parts       = courtName?.match(/^(.*?)(\d+)$/)
  const courtLabel  = parts ? parts[1].trim() || 'Quadra' : courtName
  const courtNumber = parts ? parts[2] : null

  const nameA = match.teamA ? `${match.teamA.player1} / ${match.teamA.player2}` : 'A definir'
  const nameB = match.teamB ? `${match.teamB.player1} / ${match.teamB.player2}` : 'A definir'

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Fase */}
      {roundLabel && (
        <div className="bg-indigo-700 text-center py-4 px-6 shrink-0">
          <p className="text-white text-2xl font-black tracking-[0.2em] uppercase">{roundLabel}</p>
        </div>
      )}

      {/* Quadra (chamada) ou faixa PRÓXIMO */}
      {showCourt && courtName ? (
        <div className="bg-yellow-400 text-slate-900 text-center py-4 px-6 shrink-0 flex items-center justify-center gap-4">
          <p className="text-xl font-black uppercase tracking-[0.3em]">{courtLabel}</p>
          <p className="text-5xl font-black leading-none">{courtNumber ?? courtName}</p>
        </div>
      ) : !showCourt ? (
        <div className="bg-emerald-600 text-white text-center py-4 px-6 shrink-0">
          <p className="text-2xl font-black tracking-[0.3em] uppercase">Próxima Partida</p>
        </div>
      ) : null}

      {/* Duplas */}
      <div className="bg-slate-900 text-white text-center flex flex-col items-center justify-center flex-1 min-h-0 px-10 gap-2 overflow-hidden">
        <p className="font-black text-sky-300 leading-snug w-full" style={{ fontSize: 'clamp(1.8rem, 4vw, 5rem)' }}>{nameA}</p>
        <p className="font-black text-slate-500 tracking-widest shrink-0" style={{ fontSize: 'clamp(1.5rem, 3vw, 3.5rem)' }}>×</p>
        <p className="font-black text-rose-300 leading-snug w-full" style={{ fontSize: 'clamp(1.8rem, 4vw, 5rem)' }}>{nameB}</p>
      </div>

      {/* Categoria */}
      <div className="bg-slate-800 text-center py-5 px-6 shrink-0">
        {match.category ? (
          <p className="text-slate-200 text-3xl font-bold tracking-wide">{match.category}</p>
        ) : (
          <p className="text-slate-600 text-xl font-medium italic">Sem categoria</p>
        )}
      </div>
    </div>
  )
}
