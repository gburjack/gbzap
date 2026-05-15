// src/pages/client/IntegrationsPage.jsx
import { useState, useEffect } from 'react'
import { Key, Wifi, WifiOff, RefreshCw, Loader2, Save, ExternalLink, CheckCircle } from 'lucide-react'
import { settingsApi, whatsappApi } from '../../services/api'

function Section({ title, description, children }) {
  return (
    <div className="card p-6 space-y-5">
      <div className="pb-4 border-b border-white/[0.06]">
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function ApiKeyField({ label, name, value, placeholder, link, linkLabel, onChange }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="label mb-0">{label}</label>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1">
            {linkLabel} <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className="input pr-20"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(name, e.target.value)}
        />
        <button type="button" onClick={() => setShow(p => !p)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 hover:text-gray-300">
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </div>
  )
}

function WhatsAppPanel() {
  const [status,  setStatus]  = useState({ configured: true, connected: false })
  const [qrcode,  setQrcode]  = useState(null)
  const [loading, setLoading] = useState(false)

  const loadStatus = () => {
    whatsappApi.status()
      .then(r => setStatus(r.data))
      .catch(() => setStatus({ configured: true, connected: false }))
  }

  useEffect(() => { loadStatus() }, [])

  const handleConnect = async () => {
    setLoading(true)
    try {
      const r = await whatsappApi.connect()
      setQrcode(r.data.qrcode)
      loadStatus()
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao conectar')
    } finally { setLoading(false) }
  }

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o WhatsApp? O histórico será preservado.')) return
    await whatsappApi.disconnect()
    setStatus({ configured: true, connected: false })
    setQrcode(null)
  }

  return (
    <Section
      title="WhatsApp"
      description="Conecte seu número via Evolution API"
    >
      <div className="flex items-center gap-3">
        {status?.connected ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-brand-500/10 border border-brand-500/20 rounded-lg">
            <div className="dot-online" />
            <span className="text-sm text-brand-400 font-medium">Conectado</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg">
            <WifiOff size={13} className="text-gray-500" />
            <span className="text-sm text-gray-500">Desconectado</span>
          </div>
        )}
        <button onClick={loadStatus} className="text-gray-500 hover:text-gray-300 p-1">
          <RefreshCw size={14} />
        </button>
      </div>

      {qrcode && !status?.connected && (
        <div className="bg-white rounded-xl p-4 w-fit mx-auto">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrcode)}&size=200x200`}
            alt="QR Code WhatsApp"
            className="w-48 h-48"
          />
          <p className="text-xs text-gray-700 text-center mt-2">Escaneie com o WhatsApp</p>
        </div>
      )}

      <div className="flex gap-2">
        {!status?.connected ? (
          <button onClick={handleConnect} disabled={loading}
            className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
            {qrcode ? 'Gerar novo QR' : 'Conectar WhatsApp'}
          </button>
        ) : (
          <button onClick={handleDisconnect} className="btn-danger flex items-center gap-2">
            <WifiOff size={13} />
            Desconectar
          </button>
        )}
      </div>
    </Section>
  )
}

export default function IntegrationsPage() {
  const [keys,   setKeys]   = useState({
    groq_api_key: '', gemini_api_key: '',
    evolution_api_url: '', evolution_api_key: '',
    calendly_api_key: '', calendly_event_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    settingsApi.get().then(r => {
      const c = r.data.client
      setKeys({
        groq_api_key:      c.groq_api_key || '',
        gemini_api_key:    c.gemini_api_key || '',
        evolution_api_url: c.evolution_api_url || '',
        evolution_api_key: c.evolution_api_key || '',
        calendly_api_key:  c.calendly_api_key || '',
        calendly_event_url:c.calendly_event_url || '',
      })
    })
  }, [])

  const set = (name, val) => setKeys(p => ({ ...p, [name]: val }))

  const saveKeys = async () => {
    setSaving(true)
    try {
      await settingsApi.updateApis(keys)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { alert(e.response?.data?.error || 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Integrações</h1>
        <p className="text-sm text-gray-500">Configure suas chaves de API e conexões</p>
      </div>

      <WhatsAppPanel />

      <Section title="Chaves de API" description="Suas chaves são criptografadas e armazenadas com segurança">

        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">IA — Texto</div>
        <ApiKeyField label="Groq API Key (principal)" name="groq_api_key"
          value={keys.groq_api_key} placeholder="gsk_..."
          link="https://console.groq.com" linkLabel="Obter chave"
          onChange={set} />
        <ApiKeyField label="Gemini API Key (fallback + imagens)" name="gemini_api_key"
          value={keys.gemini_api_key} placeholder="AIza..."
          link="https://aistudio.google.com" linkLabel="Obter chave"
          onChange={set} />

        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider pt-2">Evolution API</div>
        <ApiKeyField label="URL da Evolution API" name="evolution_api_url"
          value={keys.evolution_api_url} placeholder="https://sua-evolution.com"
          onChange={set} />
        <ApiKeyField label="API Key da Evolution" name="evolution_api_key"
          value={keys.evolution_api_key} placeholder="sua-chave-global"
          onChange={set} />

        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider pt-2">Calendly</div>
        <ApiKeyField label="Calendly API Key" name="calendly_api_key"
          value={keys.calendly_api_key} placeholder="eyJh..."
          link="https://developer.calendly.com" linkLabel="Obter chave"
          onChange={set} />
        <ApiKeyField label="URL do evento Calendly" name="calendly_event_url"
          value={keys.calendly_event_url} placeholder="https://calendly.com/seu-usuario/consulta"
          onChange={set} />

        <div className="flex justify-end">
          <button onClick={saveKeys} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={13} className="animate-spin" /> :
             saved  ? <CheckCircle size={13} className="text-brand-400" /> :
                      <Key size={13} />}
            {saved ? 'Salvo!' : 'Salvar chaves'}
          </button>
        </div>
      </Section>
    </div>
  )
}
