const { test } = require('node:test')
const assert = require('node:assert/strict')
const { slotChange, loserOf } = require('../src/lib/bracket')

const next = (teamAId, teamBId, status = 'waiting') => ({ id: 'n', teamAId, teamBId, status })

test('dupla que avança ocupa a primeira vaga livre', () => {
  assert.deepEqual(slotChange(next(null, null), null, 'A'), { teamAId: 'A' })
  assert.deepEqual(slotChange(next('X', null), null, 'A'), { teamBId: 'A' })
})

test('partida seguinte cheia não muda', () => {
  assert.equal(slotChange(next('X', 'Y'), null, 'A'), null)
})

test('dupla que já está na partida seguinte não entra de novo', () => {
  assert.equal(slotChange(next('A', null), null, 'A'), null)
})

test('resultado corrigido troca a dupla antiga pela nova na mesma vaga', () => {
  assert.deepEqual(slotChange(next('X', 'A'), 'A', 'B'), { teamBId: 'B' })
  assert.deepEqual(slotChange(next('A', 'X'), 'A', 'B'), { teamAId: 'B' })
})

test('resultado corrigido para empate esvazia a vaga da dupla antiga', () => {
  assert.deepEqual(slotChange(next('A', 'X'), 'A', null), { teamAId: null })
})

test('partida seguinte já finalizada não muda', () => {
  assert.equal(slotChange(next(null, null, 'finished'), null, 'A'), null)
  assert.equal(slotChange(next('A', 'X', 'finished'), 'A', 'B'), null)
})

test('sem dupla para avançar, nada muda', () => {
  assert.equal(slotChange(next(null, null), null, null), null)
  assert.equal(slotChange(next('A', null), 'A', 'A'), null)
})

test('perdedor é a outra dupla; empate não tem perdedor', () => {
  const m = { teamAId: 'A', teamBId: 'B' }
  assert.equal(loserOf(m, 'A'), 'B')
  assert.equal(loserOf(m, 'B'), 'A')
  assert.equal(loserOf(m, null), null)
})
