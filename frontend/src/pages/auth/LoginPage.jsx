// src/pages/auth/LoginPage.jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bot, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]     = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-200 flex">

      {/* Painel esquerdo — decorativo */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-surface-100 border-r border-white/[0.06] items-center justify-center overflow-hidden">
        {/* Grades decorativas */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        {/* Glow central */}
        <div className="absolute w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 text-center px-12">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Bot size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">GbZap</h1>
          <p className="text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">
            Agentes de IA para WhatsApp. Atenda clientes 24h com inteligência artificial integrada ao seu negócio.
          </p>

          {/* Stats */}
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[['24/7', 'Atendimento'], ['< 1s', 'Resposta'], ['∞', 'Conversas']].map(([n, l]) => (
              <div key={l} className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
                <p className="text-brand-400 font-bold text-lg">{n}</p>
                <p className="text-gray-500 text-xs mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm animate-fade-in">

          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <span className="font-bold text-white">GbZap</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Bem-vindo de volta</h2>
          <p className="text-sm text-gray-400 mb-8">Entre na sua conta para continuar</p>

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="seu@email.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Não tem conta?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium">
              Criar conta grátis
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
