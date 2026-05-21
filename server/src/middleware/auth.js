const jwt    = require('jsonwebtoken')
const SECRET = require('../lib/jwtSecret')

// Rotas públicas (não exigem token)
const PUBLIC = [
  { method: 'POST', path: '/auth/login' },
  { method: 'GET',  path: '/matches/tv' },
  { method: 'GET',  path: '/health' },
  { method: 'GET',  path: '/tournaments' },
]

module.exports = function auth(req, res, next) {
  // Sempre libera preflight CORS
  if (req.method === 'OPTIONS') return next()

  const isPublic = PUBLIC.some(r => r.method === req.method && req.path === r.path)
  if (isPublic) return next()

  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' })
  }
  try {
    jwt.verify(header.slice(7), SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}
