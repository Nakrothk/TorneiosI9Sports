function loserOf(match, winnerTeamId) {
  if (!winnerTeamId) return null
  return winnerTeamId === match.teamAId ? match.teamBId : match.teamAId
}

/**
 * O que muda na partida seguinte da chave quando `team` avança para ela.
 * `previous` é a dupla que tinha avançado antes (resultado corrigido): ela é trocada por `team`
 * na mesma vaga. Sem `previous`, `team` ocupa a primeira vaga livre.
 * Retorna os campos a gravar, ou null se nada muda (inclusive se a partida já foi finalizada).
 */
function slotChange(next, previous, team) {
  if (!next || next.status === 'finished' || previous === team) return null
  if (previous) {
    if (next.teamAId === previous) return { teamAId: team || null }
    if (next.teamBId === previous) return { teamBId: team || null }
    return null
  }
  if (!team || next.teamAId === team || next.teamBId === team) return null
  if (!next.teamAId) return { teamAId: team }
  if (!next.teamBId) return { teamBId: team }
  return null
}

module.exports = { loserOf, slotChange }
