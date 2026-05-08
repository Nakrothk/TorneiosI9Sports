import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Admin from './pages/Admin'
import TV    from './pages/TV'
import Login from './pages/Login'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('auth_token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/tv"    element={<TV />} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/"      element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
