// src/utils/schedule.utils.js
// Determina se a IA deve responder agora com base nas configurações do cliente

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import { supabase } from '../config/database.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isBetween);

// Fuso padrão para Brasil. No futuro: cada cliente terá seu próprio timezone
const DEFAULT_TZ = 'America/Sao_Paulo';

/**
 * Retorna o modo atual de atendimento para um cliente.
 * @returns {'ai' | 'human' | 'closed'}
 */
export async function getCurrentMode(client, schedules, holidays) {
  // 1. Override manual tem prioridade máxima
  if (client.ai_override_enabled === true)  return 'ai';
  if (client.ai_override_enabled === false) return 'human';

  // 2. Modo global é IA 24h — responde sempre
  if (client.operation_mode === 'ai_24h') return 'ai';

  // 3. Modo manual — nunca usa IA
  if (client.operation_mode === 'manual') return 'human';

  // 4. Modo híbrido — verifica horário
  const now = dayjs().tz(DEFAULT_TZ);
  const todayStr = now.format('YYYY-MM-DD');
  const dayOfWeek = now.day(); // 0=Dom ... 6=Sáb

  // 4a. Verificar feriados primeiro
  const holiday = holidays?.find(h => h.date === todayStr);
  if (holiday) {
    if (holiday.mode === 'closed') return 'closed';
    if (holiday.mode === 'ai_24h') return 'ai';
    // mode === 'normal' → continua para verificar horário normal
  }

  // 4b. Verificar horário do dia
  const schedule = schedules?.find(s => s.day_of_week === dayOfWeek && s.is_active);

  if (!schedule) return 'ai'; // sem configuração para hoje → IA assume

  if (schedule.mode === 'ai_24h') return 'ai';
  if (schedule.mode === 'closed') return 'closed';
  if (schedule.mode === 'manual') return 'human';

  // hybrid: verifica se está no horário de atendimento humano
  if (schedule.mode === 'hybrid' && schedule.human_start && schedule.human_end) {
    const startTime = dayjs.tz(`${todayStr} ${schedule.human_start}`, 'YYYY-MM-DD HH:mm', DEFAULT_TZ);
    const endTime   = dayjs.tz(`${todayStr} ${schedule.human_end}`,   'YYYY-MM-DD HH:mm', DEFAULT_TZ);

    if (now.isBetween(startTime, endTime)) {
      return 'human'; // dentro do horário comercial
    }
  }

  return 'ai'; // fora do horário → IA assume
}

/**
 * Busca cliente com seus horários e feriados do banco
 */
export async function getClientWithSchedules(clientId) {
  const [clientRes, schedulesRes, holidaysRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).single(),
    supabase.from('client_schedules').select('*').eq('client_id', clientId),
    supabase.from('client_holidays').select('*').eq('client_id', clientId),
  ]);

  return {
    client:    clientRes.data,
    schedules: schedulesRes.data || [],
    holidays:  holidaysRes.data || [],
  };
}
