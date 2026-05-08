require('dotenv').config()
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_Xvqn0B3fhHuP@ep-snowy-morning-acj5l58g.sa-east-1.aws.neon.tech/neondb?sslmode=require'
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function run() {
  try {
    await p.$executeRaw`SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE`
    console.log('SET READ WRITE ok')
  } catch(e) { console.log('SET erro:', e.message) }
  try {
    await p.team.create({ data: { player1: 'Teste', player2: 'Teste2' } })
    console.log('INSERT ok')
  } catch(e) { console.log('INSERT erro:', e.message) }
  await p.$disconnect()
}
run()
