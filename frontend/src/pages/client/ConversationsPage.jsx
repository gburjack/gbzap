// src/pages/client/ConversationsPage.jsx
import { useEffect, useState, useRef } from 'react'
import { Search, Bot, User, Clock, MessageSquare, UserCheck, UserX } from 'lucide-react'
import { conversationsApi, contactsApi } from '../../services/api'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/pt-br'

dayjs.extend(relativeTime)
dayjs.locale('pt-br')

const STATUS_BADGE = {
  open:          { label: 'Aberta',    color: 'bg-brand-500/10 text-brand-400' },
  waiting_human: { label: 'Aguardando',color: 'bg-amber-500/10 text-amber-400' },
  human_active:  { label: 'Humano',    color: 'bg-blue-500/10 text-blue-400' },
  closed:        { label: 'Encerrada', color: 'bg-white/5 text-gray-500' },
}

const SENDER_ICON = { ai: Bot, human: User, contact: User }

function MessageBubble({ msg }) {
  const isOutbound = msg.direction === 'outbound'
  const Icon = SENDER_ICON[msg.sender] || User

  return (
    <div className={`flex gap-2 ${isOutbound ? 'flex-row-reverse' : ''}`}>
      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center
        ${isOutbound ? 'bg-brand-500/20' : 'bg-white/[0.06]'}`}>
        <Icon size={11} className={isOutbound ? 'text-brand-400' : 'text-gray-400'} />
      </div>
      <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed
        ${isOutbound
          ? 'bg-brand-500/15 text-gray-100 rounded-tr-sm border border-brand-500/20'
          : 'bg-white/[0.06] text-gray-200 rounded-tl-sm border border-white/[0.06]'
        }`}>
        {msg.media_processed && (
          <p className="text-xs text-gray-500 mb-1 italic">{msg.media_processed.substring(0, 80)}...</p>
        )}
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        <p className={`text-[10px] mt-1 ${isOutbound ? 'text-brand-400/60 text-right' : 'text-gray-500'}`}>
          {dayjs(msg.created_at).format('HH:mm')}
          {msg.ai_model_used && <span className="ml-1 opacity-60">· {msg.ai_model_used.split('/')[0]}</span>}
        </p>
      </div>
    </div>
  )
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState([])
  const [selected,      setSelected]      = useState(null)
  const [messages,      setMessages]      = useState([])
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('')
  const [loading,       setLoading]       = useState(true)
  const [msgLoading,    setMsgLoading]    = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    conversationsApi.list({ status: statusFilter || undefined })
      .then(r => setConversations(r.data.conversations || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => {
    if (!selected) return
    setMsgLoading(true)
    conversationsApi.messages(selected.id)
      .then(r => setMessages(r.data.messages || []))
      .catch(console.error)
      .finally(() => setMsgLoading(false))
  }, [selected])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleTakeover = async (contactId, currentAiCtrl) => {
    await contactsApi.takeover(contactId, !currentAiCtrl)
    setConversations(prev => prev.map(c =>
      c.contact_id === contactId
        ? { ...c, contacts: { ...c.contacts } }
        : c
    ))
  }

  const filtered = conversations.filter(c => {
    const name  = c.contacts?.name || c.contacts?.phone || ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="h-full flex">

      {/* Lista de conversas */}
      <div className={`flex flex-col border-r border-white/[0.06] bg-surface-100
        ${selected ? 'hidden lg:flex lg:w-72' : 'w-full lg:w-72'}`}>

        {/* Header */}
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-sm font-semibold text-gray-200">Conversas</h1>
            <span className="badge bg-white/[0.06] text-gray-400">{conversations.length}</span>
          </div>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input pl-8 py-1.5 text-xs" placeholder="Buscar contato..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {['', 'open', 'waiting_human', 'closed'].map(s => (
              <button key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                  statusFilter === s
                    ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                    : 'text-gray-500 hover:text-gray-300'
                }`}>
                {s === '' ? 'Todas' : STATUS_BADGE[s]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare size={24} className="text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Nenhuma conversa</p>
            </div>
          ) : filtered.map(conv => {
            const badge = STATUS_BADGE[conv.status] || STATUS_BADGE.open
            const isSelected = selected?.id === conv.id
            return (
              <button key={conv.id} onClick={() => setSelected(conv)}
                className={`w-full px-4 py-3 flex items-start gap-3 border-b border-white/[0.04]
                  hover:bg-white/[0.03] text-left transition-colors
                  ${isSelected ? 'bg-brand-500/[0.06] border-l-2 border-l-brand-500' : ''}`}>
                <div className="w-8 h-8 bg-white/[0.07] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-gray-300">
                    {(conv.contacts?.name || conv.contacts?.phone || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-200 truncate">
                      {conv.contacts?.name || conv.contacts?.phone}
                    </span>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">
                      {dayjs(conv.created_at).fromNow()}
                    </span>
                  </div>
                  <span className={`badge mt-1 ${badge.color}`}>{badge.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel de mensagens */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header da conversa */}
          <div className="px-5 py-3 border-b border-white/[0.06] bg-surface-100 flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="lg:hidden text-gray-400 hover:text-white mr-1">←</button>
            <div className="w-8 h-8 bg-white/[0.07] rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold text-gray-300">
                {(selected.contacts?.name || '?')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100">{selected.contacts?.name || selected.contacts?.phone}</p>
              <p className="text-xs text-gray-500">
                {STATUS_BADGE[selected.status]?.label} · {selected.channel}
              </p>
            </div>
            <button
              onClick={() => handleTakeover(selected.contact_id, true)}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
              title="Assumir conversa"
            >
              <UserCheck size={13} />
              Assumir
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {msgLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Carregando...</div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-xs text-gray-500">Nenhuma mensagem</div>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Rodapé info */}
          <div className="px-5 py-2 border-t border-white/[0.06] text-[11px] text-gray-600 flex items-center gap-2">
            <Clock size={11} />
            Iniciada {dayjs(selected.created_at).fromNow()} · Apenas leitura — respostas via WhatsApp
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center text-center">
          <div>
            <MessageSquare size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Selecione uma conversa</p>
          </div>
        </div>
      )}
    </div>
  )
}
