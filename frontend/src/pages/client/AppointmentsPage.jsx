// src/pages/client/AppointmentsPage.jsx
import { useEffect, useState } from 'react'
import { Calendar, Clock, MapPin, Video, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { appointmentsApi } from '../../services/api'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
dayjs.locale('pt-br')

const STATUS = {
  scheduled:  { label: 'Agendado',   icon: Clock,        color: 'text-amber-400 bg-amber-400/10' },
  confirmed:  { label: 'Confirmado', icon: CheckCircle,  color: 'text-brand-400 bg-brand-400/10' },
  cancelled:  { label: 'Cancelado',  icon: XCircle,      color: 'text-red-400 bg-red-400/10' },
  completed:  { label: 'Realizado',  icon: CheckCircle,  color: 'text-gray-400 bg-gray-400/10' },
  rescheduled:{ label: 'Reagendado', icon: AlertCircle,  color: 'text-blue-400 bg-blue-400/10' },
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState([])
  const [gaps,         setGaps]         = useState([])
  const [tab,          setTab]          = useState('upcoming')
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    Promise.all([
      appointmentsApi.list({ status: tab === 'upcoming' ? 'scheduled' : undefined }),
      appointmentsApi.aiGaps(),
    ])
      .then(([a, g]) => {
        setAppointments(a.data.appointments || [])
        setGaps(g.data.gaps || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [tab])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Agendamentos</h1>
        <p className="text-sm text-gray-500">Gerencie seus agendamentos via Calendly</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 w-fit">
        {[['upcoming','Próximos'],['all','Todos'],['gaps','Gaps de IA']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${tab === k ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            {l}
            {k === 'gaps' && gaps.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-black text-[10px] font-bold w-4 h-4 rounded-full inline-flex items-center justify-center">
                {gaps.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center py-12 text-sm text-gray-500">Carregando...</div> : (

        tab === 'gaps' ? (
          <div className="space-y-3">
            {gaps.length === 0 ? (
              <div className="card p-8 text-center">
                <CheckCircle size={24} className="text-brand-500 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nenhum gap de IA pendente!</p>
              </div>
            ) : gaps.map(gap => (
              <div key={gap.id} className="card p-4">
                <p className="text-xs text-gray-500 mb-1">{gap.contacts?.name || gap.contacts?.phone}</p>
                <p className="text-sm text-gray-200 mb-2">"{gap.message_content}"</p>
                {gap.ai_response && (
                  <p className="text-xs text-gray-500 italic">IA respondeu: "{gap.ai_response?.substring(0, 100)}..."</p>
                )}
                <button onClick={() => appointmentsApi.resolveGap(gap.id, 'Resolvido pelo admin')}
                  className="mt-2 text-xs text-brand-400 hover:text-brand-300">
                  Marcar como resolvido →
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {appointments.length === 0 ? (
              <div className="card p-8 text-center">
                <Calendar size={24} className="text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nenhum agendamento</p>
              </div>
            ) : appointments.map(appt => {
              const st = STATUS[appt.status] || STATUS.scheduled
              const Icon = st.icon
              return (
                <div key={appt.id} className="card p-4 flex items-start gap-4">
                  <div className="text-center min-w-[48px] bg-white/[0.04] rounded-xl p-2 border border-white/[0.06]">
                    <p className="text-lg font-bold text-white leading-none">
                      {dayjs(appt.start_time).format('DD')}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase mt-0.5">
                      {dayjs(appt.start_time).format('MMM')}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-100">{appt.title || 'Agendamento'}</p>
                      <span className={`badge flex-shrink-0 ${st.color}`}>
                        <Icon size={10} />
                        {st.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {dayjs(appt.start_time).format('HH:mm')}
                      </span>
                      {appt.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} />
                          {appt.location}
                        </span>
                      )}
                      {appt.meeting_link && (
                        <a href={appt.meeting_link} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-brand-400 hover:text-brand-300">
                          <Video size={11} /> Link
                        </a>
                      )}
                    </div>
                    {appt.contacts && (
                      <p className="text-[11px] text-gray-600 mt-1">
                        {appt.contacts.name || appt.contacts.phone}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
