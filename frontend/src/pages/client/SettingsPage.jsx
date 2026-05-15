// src/pages/client/SettingsPage.jsx
import { useEffect, useState } from 'react'
import { Save, Loader2, Bot, Clock, Sliders } from 'lucide-react'
import { settingsApi } from '../../services/api'

const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MODES = ['ai_24h','hybrid','manual','closed']
const MODE_LABEL = { ai_24h:'IA 24h', hybrid:'Híbrido', manual:'Humano', closed:'Fechado' }

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.06]">
        <Icon size={15} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="label">{label}{hint && <span className="text-gray-600 font-normal ml-1">({hint})</span>}</label>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const [data,     setData]     = useState(null)
  const [agent,    setAgent]    = useState({})
  const [op,       setOp]       = useState({})
  const [schedules,setSchedules]= useState([])
  const [saving,   setSaving]   = useState('')
  const [saved,    setSaved]    = useState('')

  useEffect(() => {
    settingsApi.get().then(r => {
      const { client, schedules } = r.data
      setData(client)
      setAgent({
        agent_name: client.agent_name || '',
        business_name: client.business_name || '',
        business_description: client.business_description || '',
        products_services: client.products_services || '',
        location: client.location || '',
        working_hours_text: client.working_hours_text || '',
        payment_methods: client.payment_methods || '',
        differentials: client.differentials || '',
        faq: client.faq || '',
        agent_tone: client.agent_tone || 'friendly',
        agent_goal: client.agent_goal || 'general',
        agent_instructions: client.agent_instructions || '',
        agent_restrictions: client.agent_restrictions || '',
      })
      setOp({
        operation_mode: client.operation_mode || 'ai_24h',
        transition_mode: client.transition_mode || 'visible',
        transition_message: client.transition_message || '',
        followup_enabled: client.followup_enabled ?? true,
        followup_delay_h: client.followup_delay_h ?? 2,
        followup_delay2_h: client.followup_delay2_h ?? 24,
        followup_max_attempts: client.followup_max_attempts ?? 2,
        followup_message: client.followup_message || '',
      })
      setSchedules(schedules || [])
    }).catch(console.error)
  }, [])

  const save = async (section, fn, payload) => {
    setSaving(section)
    try { await fn(payload); setSaved(section); setTimeout(() => setSaved(''), 2000) }
    catch (e) { alert(e.response?.data?.error || 'Erro ao salvar') }
    finally { setSaving('') }
  }

  const SaveBtn = ({ section }) => (
    <button
      onClick={() => {
        if (section === 'agent') save(section, settingsApi.updateAgent, agent)
        if (section === 'op')    save(section, settingsApi.updateOperation, op)
        if (section === 'sched') save(section, settingsApi.updateSchedules, schedules)
      }}
      disabled={saving === section}
      className="btn-primary flex items-center gap-2"
    >
      {saving === section ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
      {saved === section ? 'Salvo!' : 'Salvar'}
    </button>
  )

  const setSchedule = (idx, field, val) => {
    setSchedules(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s))
  }

  if (!data) return <div className="p-6 text-sm text-gray-500">Carregando...</div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-gray-500">Configure seu agente de IA e modo de operação</p>
      </div>

      {/* Base de conhecimento */}
      <Section icon={Bot} title="Base de conhecimento do agente">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nome do agente">
            <input className="input" value={agent.agent_name} onChange={e => setAgent(p=>({...p,agent_name:e.target.value}))} placeholder="Ex: Ana" />
          </Field>
          <Field label="Nome do negócio">
            <input className="input" value={agent.business_name} onChange={e => setAgent(p=>({...p,business_name:e.target.value}))} placeholder="Clínica Exemplo" />
          </Field>
        </div>
        <Field label="Descrição do negócio">
          <textarea className="textarea h-20" value={agent.business_description} onChange={e => setAgent(p=>({...p,business_description:e.target.value}))} placeholder="Descreva o que você faz..." />
        </Field>
        <Field label="Produtos e serviços" hint="inclua preços">
          <textarea className="textarea h-24" value={agent.products_services} onChange={e => setAgent(p=>({...p,products_services:e.target.value}))} placeholder="Consulta: R$200&#10;Retorno: R$100" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Localização e horários">
            <textarea className="textarea h-16" value={agent.location} onChange={e => setAgent(p=>({...p,location:e.target.value}))} placeholder="Rua X, 123 — Seg a Sex 8h-18h" />
          </Field>
          <Field label="Formas de pagamento">
            <textarea className="textarea h-16" value={agent.payment_methods} onChange={e => setAgent(p=>({...p,payment_methods:e.target.value}))} placeholder="PIX, Cartão, Dinheiro" />
          </Field>
        </div>
        <Field label="Perguntas frequentes (FAQ)">
          <textarea className="textarea h-28" value={agent.faq} onChange={e => setAgent(p=>({...p,faq:e.target.value}))} placeholder="P: Vocês atendem plano de saúde?&#10;R: Sim, aceitamos Unimed e Bradesco Saúde." />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tom de voz">
            <select className="input" value={agent.agent_tone} onChange={e => setAgent(p=>({...p,agent_tone:e.target.value}))}>
              <option value="friendly">Amigável</option>
              <option value="formal">Formal</option>
              <option value="fun">Animado</option>
              <option value="professional">Profissional</option>
            </select>
          </Field>
          <Field label="Objetivo principal">
            <select className="input" value={agent.agent_goal} onChange={e => setAgent(p=>({...p,agent_goal:e.target.value}))}>
              <option value="general">Atendimento geral</option>
              <option value="sales">Vendas</option>
              <option value="scheduling">Agendamento</option>
              <option value="support">Suporte</option>
            </select>
          </Field>
        </div>
        <Field label="Instruções específicas" hint="o que o agente DEVE fazer">
          <textarea className="textarea h-20" value={agent.agent_instructions} onChange={e => setAgent(p=>({...p,agent_instructions:e.target.value}))} placeholder="Sempre pergunte o nome do paciente. Ofereça desconto de 10% para indicações..." />
        </Field>
        <Field label="Restrições" hint="o que o agente NÃO deve fazer">
          <textarea className="textarea h-16" value={agent.agent_restrictions} onChange={e => setAgent(p=>({...p,agent_restrictions:e.target.value}))} placeholder="Não mencione concorrentes. Não dê diagnósticos..." />
        </Field>
        <div className="flex justify-end"><SaveBtn section="agent" /></div>
      </Section>

      {/* Horários */}
      <Section icon={Clock} title="Horários de atendimento">
        <div className="space-y-2">
          {schedules.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-6 flex-shrink-0">{DAYS[i]}</span>
              <select
                className="input py-1.5 text-xs w-28"
                value={s.mode}
                onChange={e => setSchedule(i, 'mode', e.target.value)}
              >
                {MODES.map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
              {s.mode === 'hybrid' && (
                <>
                  <input type="time" className="input py-1.5 text-xs w-24"
                    value={s.human_start || '08:00'}
                    onChange={e => setSchedule(i, 'human_start', e.target.value)} />
                  <span className="text-gray-600 text-xs">até</span>
                  <input type="time" className="input py-1.5 text-xs w-24"
                    value={s.human_end || '18:00'}
                    onChange={e => setSchedule(i, 'human_end', e.target.value)} />
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end"><SaveBtn section="sched" /></div>
      </Section>

      {/* Operação */}
      <Section icon={Sliders} title="Modo de operação e follow-up">
        <Field label="Modo de operação">
          <select className="input" value={op.operation_mode} onChange={e => setOp(p=>({...p,operation_mode:e.target.value}))}>
            <option value="ai_24h">IA 24 horas</option>
            <option value="hybrid">Híbrido (IA + Humano)</option>
            <option value="manual">Somente humano</option>
          </select>
        </Field>
        <Field label="Transição IA → Humano">
          <select className="input" value={op.transition_mode} onChange={e => setOp(p=>({...p,transition_mode:e.target.value}))}>
            <option value="visible">Com aviso ao cliente</option>
            <option value="invisible">Invisível (sem aviso)</option>
          </select>
        </Field>
        <div className="border-t border-white/[0.06] pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-300 font-medium">Follow-up automático</p>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={op.followup_enabled}
                onChange={e => setOp(p=>({...p,followup_enabled:e.target.checked}))} />
              <div className="w-9 h-5 bg-white/10 peer-checked:bg-brand-500 rounded-full transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </label>
          </div>
          {op.followup_enabled && (
            <div className="grid grid-cols-2 gap-3 pl-1">
              <Field label="1ª tentativa após (horas)">
                <input type="number" className="input" min={1} max={72}
                  value={op.followup_delay_h} onChange={e => setOp(p=>({...p,followup_delay_h:+e.target.value}))} />
              </Field>
              <Field label="2ª tentativa após (horas)">
                <input type="number" className="input" min={1} max={168}
                  value={op.followup_delay2_h} onChange={e => setOp(p=>({...p,followup_delay2_h:+e.target.value}))} />
              </Field>
              <Field label="Máximo de tentativas">
                <input type="number" className="input" min={1} max={5}
                  value={op.followup_max_attempts} onChange={e => setOp(p=>({...p,followup_max_attempts:+e.target.value}))} />
              </Field>
              <Field label="Mensagem customizada" hint="deixe vazio para IA gerar">
                <input className="input" value={op.followup_message} placeholder="Oi {nome}, tudo bem?"
                  onChange={e => setOp(p=>({...p,followup_message:e.target.value}))} />
              </Field>
            </div>
          )}
        </div>
        <div className="flex justify-end"><SaveBtn section="op" /></div>
      </Section>
    </div>
  )
}
