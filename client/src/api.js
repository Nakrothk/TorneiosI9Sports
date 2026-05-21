// Em dev: VITE_API_URL=http://localhost:3001 (via client/.env, não commitado)
// Em produção: VITE_API_URL não definida → BASE='' → chamadas relativas (mesma origem)
const BASE = import.meta.env.VITE_API_URL ?? ''

function getToken() {
  return localStorage.getItem('auth_token')
}

async function request(method, path, body) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const options = { method, headers }
  if (body !== undefined) options.body = JSON.stringify(body)

  const res = await fetch(`${BASE}${path}`, options)

  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    window.location.replace('/login')
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const API_BASE = BASE

export const api = {
  get:    (path)            => request('GET',    path),
  post:   (path, body = {}) => request('POST',   path, body),
  put:    (path, body = {}) => request('PUT',    path, body),
  delete: (path)            => request('DELETE', path),
}
