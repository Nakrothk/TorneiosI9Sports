require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const path    = require('path')
const fs      = require('fs')

const authMiddleware    = require('./middleware/auth')
const authRouter        = require('./routes/auth')
const teamsRouter       = require('./routes/teams')
const courtsRouter      = require('./routes/courts')
const matchesRouter     = require('./routes/matches')
const importRouter      = require('./routes/import')
const tournamentsRouter = require('./routes/tournaments')

const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Autenticação global (rotas públicas definidas no middleware)
app.use(authMiddleware)

app.use('/auth',        authRouter)
app.use('/teams',       teamsRouter)
app.use('/courts',      courtsRouter)
app.use('/matches',     matchesRouter)
app.use('/import',      importRouter)
app.use('/tournaments', tournamentsRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// Serve client build em produção (quando client/dist existe)
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST))
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')))
}

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`🎾 Beach Tennis API rodando em http://localhost:${PORT}`)
})
