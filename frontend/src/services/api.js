// src/services/api.js
// Cliente HTTP centralizado. Todas as chamadas ao backend passam por aqui.

import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
})

// Injeta o token JWT automaticamente em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gbzap_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redireciona para login se o token expirar (401)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gbzap_token')
      localStorage.removeItem('gbzap_client')
      window.location.href = '/gbzap/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ────────────────────────────────────────────────────────
export const authApi = {
  login:     (data)  => api.post('/auth/login', data),
  register:  (data)  => api.post('/auth/register', data),
  me:        ()      => api.get('/auth/me'),
  adminLogin:(data)  => api.post('/auth/admin/login', data),
}

// ── Configurações ────────────────────────────────────────────────
export const settingsApi = {
  get:              ()     => api.get('/settings'),
  updateAgent:      (data) => api.patch('/settings/agent', data),
  updateOperation:  (data) => api.patch('/settings/operation', data),
  updateApis:       (data) => api.patch('/settings/apis', data),
  updateSchedules:  (data) => api.put('/settings/schedules', { schedules: data }),
  addHoliday:       (data) => api.post('/settings/holidays', data),
  deleteHoliday:    (id)   => api.delete(`/settings/holidays/${id}`),
  setAiOverride:    (val)  => api.patch('/settings/ai-override', { enabled: val }),
}

// ── Contatos ─────────────────────────────────────────────────────
export const contactsApi = {
  list:        (params) => api.get('/contacts', { params }),
  updateFunnel:(id, stage) => api.patch(`/contacts/${id}/funnel`, { funnel_stage: stage }),
  takeover:    (id, aiCtrl) => api.patch(`/contacts/${id}/takeover`, { ai_controlled: aiCtrl }),
}

// ── Conversas ────────────────────────────────────────────────────
export const conversationsApi = {
  list:     (params) => api.get('/conversations', { params }),
  messages: (id)     => api.get(`/conversations/${id}/messages`),
}

// ── Dashboard ────────────────────────────────────────────────────
export const dashboardApi = {
  get: () => api.get('/dashboard'),
}

// ── Agendamentos ─────────────────────────────────────────────────
export const appointmentsApi = {
  list:              (params) => api.get('/appointments', { params }),
  warmup:            ()       => api.get('/appointments/warmup'),
  schedulingMessage: ()       => api.get('/appointments/scheduling-message'),
  aiGaps:            ()       => api.get('/appointments/ai-gaps'),
  resolveGap:        (id, note) => api.patch(`/appointments/ai-gaps/${id}/resolve`, { resolution_note: note }),
}

// ── WhatsApp ─────────────────────────────────────────────────────
export const whatsappApi = {
  status:     () => api.get('/whatsapp/status'),
  connect:    () => api.post('/whatsapp/connect'),
  disconnect: () => api.post('/whatsapp/disconnect'),
}

// ── Admin ────────────────────────────────────────────────────────
export const adminApi = {
  clients:       () => api.get('/admin/clients'),
  setStatus: (id, status) => api.patch(`/admin/clients/${id}/status`, { status }),
}
