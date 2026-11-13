const { test } = require('node:test')
const assert = require('node:assert/strict')
const { calcStandings, rankClassified } = require('../src/lib/standings')

const entries = (ids) => ids.map((id, i) => ({ teamId: id, seed: i + 1, team: { id } }))
const game = (a, b, scoreA, scoreB) => ({ teamAId: a, teamBId: b, scoreA, scoreB, status: 'finished' })
const order = (rows) => rows.map(r => r.teamId)

test('no grupo, mais vitórias fica na frente mesmo com saldo pior', () => {
  const standings = calcStandings(entries(['A', 'B', 'C', 'D']), [
    game('A', 'B', 6, 5), game('A', 'C', 6, 5), game('D', 'A', 6, 0),
    game('B', 'D', 6, 4), game('C', 'D', 6, 4), game('B', 'C', 6, 5),
  ])
  // A: 2V saldo -4 | D: 1V saldo +2
  assert.deepEqual(order(standings), ['B', 'A', 'D', 'C'])
})

test('no grupo, empate em vitórias é decidido pelo saldo', () => {
  const standings = calcStandings(entries(['A', 'B', 'C']), [
    game('A', 'B', 6, 4), game('B', 'C', 6, 0), game('C', 'A', 6, 5),
  ])
  // todos com 1V; saldo B +4, C -1, A +1
  assert.deepEqual(order(standings), ['B', 'A', 'C'])
})

test('no grupo, empate em vitórias e saldo é decidido pelos games pró', () => {
  const standings = calcStandings(entries(['A', 'B', 'C']), [
    game('A', 'B', 6, 4), game('B', 'C', 7, 5), game('C', 'A', 6, 4),
  ])
  // todos com 1V e saldo 0; GP A 10, B 11, C 11 -> B e C empatam em tudo
  assert.equal(order(standings)[2], 'A')
})

test('partidas não finalizadas não contam', () => {
  const standings = calcStandings(entries(['A', 'B']), [
    { ...game('B', 'A', 6, 0), status: 'playing' },
    game('A', 'B', 6, 5),
  ])
  assert.deepEqual(order(standings), ['A', 'B'])
  assert.equal(standings[0].V, 1)
  assert.equal(standings[1].J, 1)
})

test('entre grupos, quem tem mais vitórias fica na frente de quem tem mais saldo', () => {
  const ranked = rankClassified([
    { teamId: 'muito-saldo', V: 2, S: 15, GP: 30 },
    { teamId: 'mais-vitorias', V: 3, S: 2, GP: 20 },
    { teamId: 'medio', V: 2, S: 5, GP: 25 },
  ])
  assert.deepEqual(order(ranked), ['mais-vitorias', 'muito-saldo', 'medio'])
})

test('entre grupos, empate em vitórias e saldo é decidido pelos games pró', () => {
  const ranked = rankClassified([
    { teamId: 'menos-games', V: 2, S: 4, GP: 18 },
    { teamId: 'mais-games', V: 2, S: 4, GP: 22 },
  ])
  assert.deepEqual(order(ranked), ['mais-games', 'menos-games'])
})
