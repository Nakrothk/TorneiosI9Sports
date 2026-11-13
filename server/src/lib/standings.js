// Critério de classificação: vitórias → saldo de games → games pró.
const byCriteria = (a, b) => b.V - a.V || b.S - a.S || b.GP - a.GP

/**
 * Classificação de um grupo (todos contra todos), já ordenada.
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
    .sort(byCriteria)
}

/**
 * Ordena classificados de grupos diferentes entre si, pelo mesmo critério.
 */
function rankClassified(rows) {
  return [...rows].sort(byCriteria)
}

module.exports = { calcStandings, rankClassified }
