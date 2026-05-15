// src/pages/admin/AdminPage.jsx
import { useState, useEffect } from 'react'
import { Bot, Users, CheckCircle, XCircle, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { adminApi, authApi } from '../../services/api'
import dayjs from 'dayjs'

const PLAN_COLOR = { basic: 'text-gray-400', pro: 'text-brand-400', enterprise: 'text-purple-400' }
const STATUS_COLOR = { active: 'text-brand-400', suspended: 'text-red-400', trial: 'text-amber-400' }

export default function AdminPage() {
  const [token,   setToken]   = useState(() => localStorage.getItem('gbzap_admin_token') || '')
  const [email,   setEmail]   = useState('')
  const [password,setPassword]= useState('')
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const isLoggedIn = !!token

  const login = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await authApi.adminLogin({ email, password })
      localStorage.setItem('gbzap_admin_token', r.data.token)
      setToken(r.data.token)
    } catch (err) {
      setError(err.response?.data?.error || 'Credenciais inválidas')
    } finally { setLoading(false) }
  }

  const logout = () => {
    localStorage.removeItem('gbzap_admin_token')
    setToken('')
    setClients([])
  }

  useEffect(() => {
    if (!isLoggedIn) return
    // Adiciona token admin ao header temporariamente
    const prev = localStorage.getItem('gbzap_token')
    localStorage.setItem('gbzap_token', token)

    adminApi.clients()
      .then(r => setClients(r.data.clients || []))
      .catch(() => logout())
      .finally(() => {
        if (prev) localStorage.setItem('gbzap_token', prev)
        else localStorage.removeItem('gbzap_token')
      })
  }, [isLoggedIn])

  const toggleStatus = async (id, currentStatus) => {
    const next = currentStatus === 'active' ? 'suspended' : 'active'
    localStorage.setItem('gbzap_token', token)
    await adminApi.setStatus(id, next)
    setClients(prev => prev.map(c => c.id === id ? { ...c, status: next } : c))
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-surface-200 flex items-center justify-center px-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex items-center gap-2 mb-8">
            <ShieldCheck size={20} className="text-brand-500" />
            <span className="font-bold text-white">GbZap Admin</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-6">Acesso restrito</h2>

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="label">Email admin</label>
              <input type="email" className="input" value={email}
                onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Senha</label>
              <input type="password" className="input" value={password}
                onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Entrar
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-200 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Painel Admin</h1>
              <p className="text-xs text-gray-500">Gestão de clientes da plataforma</p>
            </div>
          </div>
          <button onClick={logout} className="btn-secondary flex items-center gap-2 text-xs">
            <LogOut size={13} />
            Sair
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            ['Total', clients.length, 'text-white'],
            ['Ativos', clients.filter(c => c.status === 'active').length, 'text-brand-400'],
            ['Suspensos', clients.filter(c => c.status === 'suspended').length, 'text-red-400'],
          ].map(([l, v, c]) => (
            <div key={l} className="card p-4 text-center">
              <p className={`text-2xl font-bold ${c}`}>{v}</p>
              <p className="text-xs text-gray-500 mt-0.5">{l}</p>
            </div>
          ))}
        </div>

        {/* Tabela de clientes */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Users size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-200">Clientes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="text-left px-5 py-3">Nome</th>
                  <th className="text-left px-5 py-3">Email</th>
                  <th className="text-left px-5 py-3">Plano</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Cadastro</th>
                  <th className="text-left px-5 py-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {clients.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-200 font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-sm text-gray-400">{c.email}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium capitalize ${PLAN_COLOR[c.plan]}`}>
                        {c.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium capitalize ${STATUS_COLOR[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {dayjs(c.created_at).format('DD/MM/YYYY')}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleStatus(c.id, c.status)}
                        className={`text-xs flex items-center gap-1 ${
                          c.status === 'active'
                            ? 'text-red-400 hover:text-red-300'
                            : 'text-brand-400 hover:text-brand-300'
                        }`}
                      >
                        {c.status === 'active'
                          ? <><XCircle size={12} /> Suspender</>
                          : <><CheckCircle size={12} /> Ativar</>
                        }
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clients.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-500">Nenhum cliente cadastrado</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
