// src/pages/client/ContactsPage.jsx
import { useEffect, useState } from 'react'
import { Search, ChevronDown, Bot, User, ArrowRight } from 'lucide-react'
import { contactsApi } from '../../services/api'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
dayjs.locale('pt-br')

const STAGES = [
  { key: 'new',         label: 'Novos',       color: 'bg-gray-500',   text: 'text-gray-300' },
  { key: 'interest',    label: 'Interesse',   color: 'bg-blue-500',   text: 'text-blue-300' },
  { key: 'negotiation', label: 'Negociação',  color: 'bg-amber-500',  text: 'text-amber-300' },
  { key: 'closed',      label: 'Fechados',    color: 'bg-brand-500',  text: 'text-brand-300' },
  { key: 'post_sale',   label: 'Pós-venda',   color: 'bg-purple-500', text: 'text-purple-300' },
]

function ContactCard({ contact, onFunnelChange, onTakeover }) {
  const [open, setOpen] = useState(false)
  const stage = STAGES.find(s => s.key === contact.funnel_stage) || STAGES[0]

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-white/[0.07] rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-gray-300">
            {(contact.name || contact.phone)[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-100 truncate">{contact.name || 'Sem nome'}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* AI toggle */}
              <button
                onClick={() => onTakeover(contact.id, !contact.ai_controlled)}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  contact.ai_controlled
                    ? 'bg-brand-500/10 text-brand-400 border-brand-500/20'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                }`}
              >
                {contact.ai_controlled ? <Bot size={10} /> : <User size={10} />}
                {contact.ai_controlled ? 'IA' : 'Humano'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500">{contact.phone}</p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Último contato: {contact.last_seen_at ? dayjs(contact.last_seen_at).fromNow() : '—'}
          </p>
        </div>
      </div>

      {/* Funil */}
      <div className="mt-3 flex items-center gap-2">
        <span className={`badge ${stage.color}/15 ${stage.text} border border-current/20`}>
          {stage.label}
        </span>
        <div className="relative ml-auto">
          <button onClick={() => setOpen(p => !p)}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
            Mover <ChevronDown size={11} />
          </button>
          {open && (
            <div className="absolute right-0 top-6 bg-surface-50 border border-white/[0.08] rounded-lg py-1 z-10 w-36 shadow-xl">
              {STAGES.map(s => (
                <button key={s.key}
                  onClick={() => { onFunnelChange(contact.id, s.key); setOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] flex items-center gap-2
                    ${s.key === contact.funnel_stage ? 'text-brand-400' : 'text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ContactsPage() {
  const [contacts,    setContacts]    = useState([])
  const [search,      setSearch]      = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [loading,     setLoading]     = useState(true)

  const load = () => {
    setLoading(true)
    contactsApi.list({ stage: stageFilter || undefined })
      .then(r => setContacts(r.data.contacts || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [stageFilter])

  const handleFunnelChange = async (id, stage) => {
    await contactsApi.updateFunnel(id, stage)
    setContacts(prev => prev.map(c => c.id === id ? { ...c, funnel_stage: stage } : c))
  }

  const handleTakeover = async (id, aiCtrl) => {
    await contactsApi.takeover(id, aiCtrl)
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ai_controlled: aiCtrl } : c))
  }

  const filtered = contacts.filter(c =>
    (c.name || c.phone).toLowerCase().includes(search.toLowerCase())
  )

  // Contagem por estágio
  const counts = {}
  contacts.forEach(c => { counts[c.funnel_stage] = (counts[c.funnel_stage] || 0) + 1 })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Contatos</h1>
        <p className="text-sm text-gray-500">{contacts.length} contato(s) total</p>
      </div>

      {/* Funil visual */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STAGES.map(s => (
          <button key={s.key}
            onClick={() => setStageFilter(stageFilter === s.key ? '' : s.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-all
              ${stageFilter === s.key
                ? `${s.color}/20 ${s.text} border-current/20`
                : 'border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/10'
              }`}>
            {s.label}
            <span className="ml-1.5 opacity-60">{counts[s.key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-8" placeholder="Buscar por nome ou telefone..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Grid de contatos */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">Nenhum contato encontrado</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => (
            <ContactCard key={c.id} contact={c}
              onFunnelChange={handleFunnelChange}
              onTakeover={handleTakeover}
            />
          ))}
        </div>
      )}
    </div>
  )
}
