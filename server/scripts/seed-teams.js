require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const teams = [
  ['Ana Paula', 'Beatriz Lima'],
  ['Carla Souza', 'Daniela Reis'],
  ['Fernanda Costa', 'Gabriela Nunes'],
  ['Helena Martins', 'Isabela Ferreira'],
  ['Juliana Alves', 'Karina Mendes'],
  ['Larissa Rocha', 'Mariana Teixeira'],
  ['Natalia Borges', 'Olivia Castro'],
  ['Patricia Dias', 'Renata Gomes'],
  ['Sabrina Lopes', 'Tatiane Moura'],
  ['Vanessa Pinto', 'Yasmin Ribeiro'],
  ['Andre Lima', 'Bruno Costa'],
  ['Carlos Souza', 'Diego Martins'],
  ['Eduardo Alves', 'Felipe Nunes'],
  ['Gustavo Reis', 'Henrique Ferreira'],
  ['Igor Mendes', 'Jonas Teixeira'],
  ['Lucas Rocha', 'Marcelo Castro'],
  ['Nicolas Gomes', 'Otavio Dias'],
  ['Pedro Lopes', 'Rafael Moura'],
  ['Samuel Pinto', 'Thiago Ribeiro'],
  ['Vitor Borges', 'Wellington Lima'],
]

async function run() {
  await p.match.deleteMany({})
  await p.tournamentEntry.deleteMany({})
  await p.tournament.deleteMany({})
  await p.team.deleteMany({})
  console.log('Dados anteriores removidos.')

  for (const [player1, player2] of teams) {
    await p.team.create({ data: { player1, player2 } })
  }
  console.log('20 duplas criadas com sucesso!')
  await p.$disconnect()
}

run().catch(e => { console.error(e.message); process.exit(1) })
