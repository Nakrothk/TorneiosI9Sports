require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('Limpando banco...')
  await prisma.match.deleteMany()
  await prisma.team.deleteMany()
  await prisma.court.deleteMany()

  console.log('Criando quadras...')
  const [q1, q2, q3, q4] = await Promise.all([
    prisma.court.create({ data: { name: 'Quadra 1' } }),
    prisma.court.create({ data: { name: 'Quadra 2' } }),
    prisma.court.create({ data: { name: 'Quadra 3' } }),
    prisma.court.create({ data: { name: 'Quadra 4' } }),
  ])

  console.log('Criando duplas...')
  const [t1, t2, t3, t4, t5, t6] = await Promise.all([
    prisma.team.create({ data: { player1: 'João Silva', player2: 'Pedro Costa' } }),
    prisma.team.create({ data: { player1: 'Maria Santos', player2: 'Ana Lima' } }),
    prisma.team.create({ data: { player1: 'Carlos Rocha', player2: 'Lucas Mendes' } }),
    prisma.team.create({ data: { player1: 'Fernanda Dias', player2: 'Beatriz Alves' } }),
    prisma.team.create({ data: { player1: 'Rafael Nunes', player2: 'Bruno Ferreira' } }),
    prisma.team.create({ data: { player1: 'Camila Torres', player2: 'Juliana Pinto' } }),
  ])

  console.log('Criando partidas...')
  await Promise.all([
    prisma.match.create({
      data: {
        teamAId: t1.id,
        teamBId: t2.id,
        courtId: q1.id,
        status: 'playing',
        scoreA: 4,
        scoreB: 3,
        prevScoreA: 3,
        prevScoreB: 3,
      },
    }),
    prisma.match.create({
      data: {
        teamAId: t3.id,
        teamBId: t4.id,
        courtId: q2.id,
        status: 'playing',
        scoreA: 2,
        scoreB: 5,
        prevScoreA: 2,
        prevScoreB: 4,
      },
    }),
    prisma.match.create({
      data: {
        teamAId: t5.id,
        teamBId: t6.id,
        courtId: q3.id,
        status: 'waiting',
        scoreA: 0,
        scoreB: 0,
        prevScoreA: 0,
        prevScoreB: 0,
      },
    }),
    prisma.match.create({
      data: {
        teamAId: t1.id,
        teamBId: t3.id,
        courtId: null,
        status: 'waiting',
        scoreA: 0,
        scoreB: 0,
        prevScoreA: 0,
        prevScoreB: 0,
      },
    }),
  ])

  console.log('✅ Seed concluído!')
  console.log(`   4 quadras | 6 duplas | 4 partidas`)
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
