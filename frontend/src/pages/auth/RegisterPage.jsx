// src/pages/auth/RegisterPage.jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bot, ArrowRight, Loader2 } from 'lucide-react'
import { authApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm]       = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError('A senha deve ter no mínimo 8 caracteres'); return }
    setLoading(true)
    try {
      await authApi.register(form)
      await login(form.email, form.password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-200 flex items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
          <span className="font-bold text-white">GbZap</span>
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Criar conta</h2>
        <p className="text-sm text-gray-400 mb-8">Comece gratuitamente hoje</p>

        {error && (
          <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nome completo</label>
            <input type="text" className="input" placeholder="João Silva"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" placeholder="seu@email.com"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Senha <span className="text-gray-500">(mín. 8 caracteres)</span></label>
            <input type="password" className="input" placeholder="••••••••"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Já tem conta?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">Entrar</Link>
        </p>
      </div>
    </div>
  )
}
