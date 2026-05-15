// src/pages/client/DashboardPage.jsx
import { useEffect, useState } from 'react'
import { MessageSquare, Calendar, AlertCircle, TrendingUp, Zap, Users, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import { dashboardApi, appointmentsApi, settingsApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'

const FUNNEL_LABELS = {
  new: 'Novos', interest: 'Interesse', negotiation: 'Negociação',
  closed: 'Fechados', post_sale: 'Pós-venda',
}
const FUNNEL_COLORS = {
  new: 'bg-gray-500', interest: 'bg-blue-500', negotiation: 'bg-amber-500',
  closed: 'bg-brand-500', post_sale: 'bg-purple-500',
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-brand-400' }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-9 h-9 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={17} />
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function AiToggle({ client, updateClient }) {
  const [loading, setLoading] = useState(false)
  const current = client?.ai_override_enabled

  const cycle = async () => {
    setLoading(true)
    try {
      // null → true → false → null
      const next = current === null ? true : current === true ? false : null
      await settingsApi.setAiOverride(next)
      updateClient({ ai_override_enabled: next })
    } finally { setLoading(false) }
  }

  const label  = current === true ? 'IA Forçada ON' : current === false ? 'IA Forçada OFF' : 'IA Automática'
  const color  = current === true ? 'text-brand-400' : current === false ? 'text-red-400' : 'text-gray-400'
  const Icon   = current === false ? ToggleLeft : ToggleRight

  return (
    <button onClick={cycle} disabled={loading}
      className="card px-4 py-3 flex items-center gap-3 hover:border-white/10 transition-all w-full text-left">
      {loading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : <Icon size={16} className={color} />}
      <div>
        <p className={`text-sm font-medium ${color}`}>{label}</p>
        <p className="text-[11px] text-gray-500">Clique para alternar</p>
      </div>
    </button>
  )
}

export default function DashboardPage() {
  const { client, updateClient } = useAuth()
  const [stats,   setStats]   = useState(null)
  const [warmup,  setWarmup]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([dashboardApi.get(), appointmentsApi.warmup()])
      .then(([s, w]) => {
        setStats(s.data)
        setWarmup(w.data.warmup)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const totalContacts = stats ? Object.values(stats.funnel || {}).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500">Bem-vindo de volta, {client?.name?.split(' ')[0]} 👋</p>
        </div>
        <div className="w-64">
          <AiToggle client={client} updateClient={updateClient} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={MessageSquare} label="Conversas hoje"  value={stats?.conversations?.today}  color="text-blue-400" />
        <StatCard icon={TrendingUp}    label="Conversas (7d)"  value={stats?.conversations?.week}   color="text-brand-400" />
        <StatCard icon={Calendar}      label="Agendamentos/mês" value={stats?.appointments_month}   color="text-purple-400" />
        <StatCard icon={AlertCircle}   label="Gaps de IA"      value={stats?.ai_gaps}
          sub="mensagens sem resposta" color="text-amber-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">

        {/* Funil de vendas */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-200">Funil de vendas</h2>
            <span className="ml-auto text-xs text-gray-500">{totalContacts} contatos</span>
          </div>
          <div className="space-y-3">
            {Object.entries(FUNNEL_LABELS).map(([key, label]) => {
              const count = stats?.funnel?.[key] || 0
              const pct   = totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{label}</span>
                    <span className="font-medium text-gray-200">{count}</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${FUNNEL_COLORS[key]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Aquecimento de número */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={15} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-gray-200">Aquecimento</h2>
          </div>

          {warmup ? (
            warmup.complete ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Zap size={20} className="text-brand-400" />
                </div>
                <p className="text-sm font-semibold text-brand-400">Aquecimento completo!</p>
                <p className="text-xs text-gray-500 mt-1">Sem limite de mensagens</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Círculo de progresso simples */}
                <div className="relative w-24 h-24 mx-auto">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#22c55e" strokeWidth="3"
                      strokeDasharray={`${(warmup.progressPct / 100) * 94} 94`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{warmup.progressPct}%</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">Dia {warmup.currentDay} de {warmup.totalDays}</p>
                  {warmup.dailyLimit && (
                    <p className="text-xs text-gray-500 mt-0.5">Limite hoje: {warmup.dailyLimit} msgs</p>
                  )}
                </div>
                <div className="space-y-1">
                  {warmup.schedule?.slice(0, 7).map((limit, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i < warmup.currentDay ? 'bg-brand-500' : i === warmup.currentDay ? 'bg-amber-400' : 'bg-white/10'}`} />
                      <span className="text-[11px] text-gray-500">Dia {i + 1}: {limit} msgs</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-6 text-gray-500 text-sm">
              Configure o WhatsApp para ver o aquecimento
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
