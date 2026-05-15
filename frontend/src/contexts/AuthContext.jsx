// src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [client, setClient]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('gbzap_client')) } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  // Valida o token ao carregar a página
  useEffect(() => {
    const token = localStorage.getItem('gbzap_token')
    if (!token) { setLoading(false); return }

    authApi.me()
      .then(res => setClient(res.data.client))
      .catch(() => logout())
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password })
    localStorage.setItem('gbzap_token', res.data.token)
    localStorage.setItem('gbzap_client', JSON.stringify(res.data.client))
    setClient(res.data.client)
    return res.data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('gbzap_token')
    localStorage.removeItem('gbzap_client')
    setClient(null)
  }, [])

  const updateClient = useCallback((data) => {
    setClient(prev => {
      const updated = { ...prev, ...data }
      localStorage.setItem('gbzap_client', JSON.stringify(updated))
      return updated
    })
  }, [])

  return (
    <AuthContext.Provider value={{ client, loading, login, logout, updateClient }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
