import { useState, useEffect } from 'react'
import { api } from '../api'

const COLORS = ['Verde', 'Amarelo', 'Azul', 'Branco']

const COLOR_STYLE = {
  Verde:   { dot: 'bg-green-500',  name: 'text-green-400',  wins: 'text-green-400',  border: 'border-green-900' },
  Amarelo: { dot: 'bg-yellow-400', name: 'text-yellow-300', wins: 'text-yellow-300', border: 'border-yellow-900' },
  Azul:    { dot: 'bg-blue-500',   name: 'text-blue-400',   wins: 'text-blue-400',   border: 'border-blue-900' },
  Branco:  { dot: 'bg-white',      name: 'text-white',      wins: 'text-white',      border: 'border-slate-600' },
}

function computeStandings(tournament) {
  const teamColor = new Map(tournament.entries.map(e => [e.teamId, e.colorTeam]))
  const stats = {}
  for (const c of COLORS) stats[c] = { wins: 0, losses: 0, draws: 0, played: 0 }

  for (const m of tournament.matches) {
    if (m.status !== 'finished') continue
    const colorA = teamColor.get(m.teamAId) ?? null
    const colorB = teamColor.get(m.teamBId) ?? null
    if (!colorA || !colorB || !stats[colorA] || !stats[colorB]) continue

    stats[colorA].played++
    stats[colorB].played++

    if (m.scoreA > m.scoreB) {
      stats[colorA].wins++
      stats[colorB].losses++
    } else if (m.scoreB > m.scoreA) {
      stats[colorB].wins++
      stats[colorA].losses++
    } else {
      stats[colorA].draws++
      stats[colorB].draws++
    }
  }

  return COLORS
    .map(c => ({ color: c, ...stats[c] }))
    .sort((a, b) => b.wins - a.wins || b.played - a.played)
}

// Outer shell: always fills the true viewport (accounts for mobile browser chrome)
function Shell({ children }) {
  return (
    <div
      className="bg-slate-950 flex flex-col overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {children}
    </div>
  )
}

export default function Placar() {
  const [tournaments, setTournaments] = useState(null)

  useEffect(() => {
    const refresh = async () => {
      try {
        const all = await api.get('/tournaments')
        setTournaments(all.filter(t => t.type === 'ffa'))
      } catch {}
    }
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [])

  if (tournaments === null) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-600 font-bold" style={{ fontSize: 'clamp(1.2rem, 5vw, 2rem)' }}>Carregando...</p>
        </div>
      </Shell>
    )
  }

  if (tournaments.length === 0) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p style={{ fontSize: 'clamp(3rem, 15vw, 6rem)' }}>🎾</p>
          <p className="text-slate-600 font-bold tracking-widest uppercase" style={{ fontSize: 'clamp(0.9rem, 4vw, 1.5rem)' }}>Nenhum torneio ativo</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {tournaments.map(t => (
        <TournamentSection
          key={t.id}
          name={t.name}
          standings={computeStandings(t)}
          count={tournaments.length}
        />
      ))}
    </Shell>
  )
}

/* Each tournament occupies an equal share of the screen height */
function TournamentSection({ name, standings, count }) {
  const totalGames = standings.reduce((s, x) => s + x.played, 0) / 2

  return (
    <div className="flex flex-col min-h-0" style={{ flex: 1 }}>
      {/* Tournament name bar */}
      <div className="bg-indigo-800 shrink-0 flex items-center justify-between px-5"
        style={{ paddingTop: 'clamp(0.4rem, 1.5vh, 0.9rem)', paddingBottom: 'clamp(0.4rem, 1.5vh, 0.9rem)' }}
      >
        <p
          className="text-white font-black tracking-widest uppercase"
          style={{ fontSize: 'clamp(0.85rem, 3.5vw, 1.4rem)' }}
        >
          {name}
        </p>
        {totalGames > 0 && (
          <span className="text-indigo-300 font-medium" style={{ fontSize: 'clamp(0.7rem, 2.5vw, 1rem)' }}>
            {totalGames} jogo{totalGames !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Team rows — each takes equal space within this tournament section */}
      <div className="flex flex-col flex-1 min-h-0 bg-slate-900">
        {standings.map((s, i) => (
          <TeamRow
            key={s.color}
            standing={s}
            rank={i + 1}
            isLast={i === standings.length - 1}
            numTournaments={count}
          />
        ))}
      </div>
    </div>
  )
}

function TeamRow({ standing, rank, isLast, numTournaments }) {
  const style = COLOR_STYLE[standing.color] ?? {
    dot: 'bg-slate-500', name: 'text-slate-300', wins: 'text-slate-300', border: 'border-slate-700',
  }
  const isFirst = rank === 1

  // Font sizes scale with viewport; with multiple tournaments they shrink a bit
  const nameSz  = numTournaments > 1
    ? 'clamp(1.2rem, 4.5vw, 2.5rem)'
    : 'clamp(1.5rem, 6vw, 3.2rem)'
  const winsSz  = numTournaments > 1
    ? 'clamp(2rem, 8vw, 4rem)'
    : 'clamp(2.5rem, 11vw, 6rem)'
  const rankSz  = numTournaments > 1
    ? 'clamp(1rem, 3.5vw, 1.8rem)'
    : 'clamp(1.2rem, 4.5vw, 2.2rem)'
  const labelSz = 'clamp(0.55rem, 1.8vw, 0.75rem)'
  const gameSz  = numTournaments > 1
    ? 'clamp(0.9rem, 3vw, 1.5rem)'
    : 'clamp(1rem, 3.5vw, 1.8rem)'

  return (
    <div
      className={`flex flex-1 min-h-0 items-center px-5 gap-4 ${!isLast ? `border-b ${style.border}` : ''}`}
    >
      {/* Rank */}
      <span
        className={`font-black text-center shrink-0 ${isFirst ? 'text-yellow-400' : 'text-slate-600'}`}
        style={{ fontSize: rankSz, minWidth: '1.2em' }}
      >
        {rank}
      </span>

      {/* Color dot + name */}
      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
        <span className={`rounded-full shrink-0 ${style.dot}`}
          style={{ width: 'clamp(0.7rem, 2.5vw, 1.2rem)', height: 'clamp(0.7rem, 2.5vw, 1.2rem)' }}
        />
        <span
          className={`font-black tracking-wide truncate ${style.name}`}
          style={{ fontSize: nameSz }}
        >
          {standing.color}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right">
          <p className="text-slate-500 font-semibold uppercase tracking-widest leading-none"
            style={{ fontSize: labelSz, marginBottom: '0.2em' }}>
            Vitórias
          </p>
          <p className={`font-black leading-none ${style.wins}`} style={{ fontSize: winsSz }}>
            {standing.wins}
          </p>
        </div>
        {standing.played > 0 && (
          <div className="text-right">
            <p className="text-slate-600 font-semibold uppercase tracking-widest leading-none"
              style={{ fontSize: labelSz, marginBottom: '0.2em' }}>
              Jogos
            </p>
            <p className="text-slate-500 font-bold leading-none" style={{ fontSize: gameSz }}>
              {standing.played}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
