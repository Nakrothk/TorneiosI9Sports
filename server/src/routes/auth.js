const express = require('express')
const jwt     = require('jsonwebtoken')
const SECRET  = require('../lib/jwtSecret')

const router = express.Router()

const CREDENTIALS = {
  email:    'i9sports@torneio.com.br',
  password: 'Inovesports1.@',
}

router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {}
  if (email === CREDENTIALS.email && password === CREDENTIALS.password) {
    const token = jwt.sign({ email }, SECRET, { expiresIn: '7d' })
    return res.json({ token })
  }
  res.status(401).json({ error: 'Email ou senha inválidos' })
})

module.exports = router
