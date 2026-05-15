// src/services/reminders/reminder.service.js
// Gerencia os lembretes automáticos de agendamentos do Calendly.
//
// Fluxo:
//   1. Cron (a cada hora) chama checkAndScheduleReminders()
//   2. Busca agendamentos futuros que precisam de lembrete
//   3. Enfileira jobs com delay exato até o momento do envio
//   4. Worker envia a mensagem e aguarda confirmação do cliente
//   5. Se cliente confirmar: resposta de confirmação
//   6. Se cliente cancelar: IA oferece reagendamento
//   7. Se não responder: apenas registra

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import 'dayjs/locale/pt-br.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { reminderQueue } from '../../queues/queues.js';
import { sendMessageWithDelay } from '../whatsapp/evolution.service.js';
import { saveOutboundMessage, logEvent } from '../whatsapp/conversation.service.js';
import { buildSchedulingMessage } from '../calendly/calendly.service.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('pt-br');

const TZ = 'America/Sao_Paulo';

// ─── AGENDADOR (chamado pelo cron a cada hora) ────────────────────────────────

/**
 * Verifica agendamentos próximos e enfileira lembretes.
 */
export async function checkAndScheduleReminders() {
  logger.info('[Reminder] Verificando agendamentos próximos...');

  try {
    const now    = dayjs().tz(TZ);
    const in25h  = now.add(25, 'hour').toISOString(); // janela para lembrete de 24h
    const in2h   = now.add(2, 'hour').toISOString();  // janela para lembrete de 1h

    // Busca agendamentos confirmados nos próximos 25h
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id, client_id, contact_id, title, start_time, end_time,
        location, meeting_link, status,
        reminder_24h_sent, reminder_1h_sent,
        contacts ( phone, name ),
        clients ( evolution_api_url, evolution_api_key, agent_name, business_name, calendly_event_url )
      `)
      .in('status', ['scheduled', 'confirmed'])
      .gt('start_time', now.toISOString())
      .lt('start_time', in25h);

    if (error) throw error;
    if (!appointments?.length) {
      logger.info('[Reminder] Nenhum agendamento próximo');
      return;
    }

    let scheduled = 0;

    for (const appt of appointments) {
      const startTime   = dayjs(appt.start_time).tz(TZ);
      const hoursUntil  = startTime.diff(now, 'hour', true);
      const phone       = appt.contacts?.phone;
      const client      = appt.clients;

      if (!phone || !client?.evolution_api_url) continue;

      // ── Lembrete de 24h ─────────────────────────────────────────
      if (!appt.reminder_24h_sent && hoursUntil <= 24 && hoursUntil > 1) {
        const jobId = `reminder:24h:${appt.id}`;
        const existing = await reminderQueue.getJob(jobId);

        if (!existing) {
          // Calcula o delay: enviar agora se o horário ideal já passou,
          // ou agendar para enviar ~24h antes do agendamento
          const idealSendTime = startTime.subtract(24, 'hour');
          const delayMs       = Math.max(0, idealSendTime.diff(now, 'millisecond'));

          await reminderQueue.add(
            buildReminderJob({ appt, phone, client, type: '24h' }),
            { jobId, delay: delayMs }
          );

          scheduled++;
          logger.info(`[Reminder] Lembrete 24h enfileirado: ${appt.id} (delay: ${Math.round(delayMs / 60000)}min)`);
        }
      }

      // ── Lembrete de 1h ──────────────────────────────────────────
      if (!appt.reminder_1h_sent && hoursUntil <= 2 && hoursUntil > 0.1) {
        const jobId = `reminder:1h:${appt.id}`;
        const existing = await reminderQueue.getJob(jobId);

        if (!existing) {
          const idealSendTime = startTime.subtract(1, 'hour');
          const delayMs       = Math.max(0, idealSendTime.diff(now, 'millisecond'));

          await reminderQueue.add(
            buildReminderJob({ appt, phone, client, type: '1h' }),
            { jobId, delay: delayMs }
          );

          scheduled++;
          logger.info(`[Reminder] Lembrete 1h enfileirado: ${appt.id} (delay: ${Math.round(delayMs / 60000)}min)`);
        }
      }
    }

    logger.info(`[Reminder] ${scheduled} lembrete(s) enfileirado(s)`);
  } catch (err) {
    logger.error('[Reminder] Erro ao verificar lembretes:', err.message);
  }
}

function buildReminderJob({ appt, phone, client, type }) {
  return {
    appointmentId: appt.id,
    clientId:      appt.client_id,
    contactId:     appt.contact_id,
    phone,
    type,                          // '24h' | '1h'
    appointmentData: {
      title:       appt.title,
      startTime:   appt.start_time,
      endTime:     appt.end_time,
      location:    appt.location,
      meetingLink: appt.meeting_link,
    },
    clientData: {
      evolutionUrl:    client.evolution_api_url,
      evolutionKey:    client.evolution_api_key,
      agentName:       client.agent_name,
      businessName:    client.business_name,
      calendlyEventUrl: client.calendly_event_url,
    },
    contactName: appt.contacts?.name,
  };
}

// ─── WORKER (processa cada job de lembrete) ───────────────────────────────────

/**
 * Processa um job de lembrete da fila.
 */
export async function processReminderJob(job) {
  const { appointmentId, clientId, contactId, phone, type, appointmentData, clientData, contactName } = job.data;

  logger.info(`[Reminder] Processando lembrete ${type}: agendamento ${appointmentId}`);

  try {
    const { evolutionUrl, evolutionKey, agentName, businessName, calendlyEventUrl } = clientData;
    const startTime = dayjs(appointmentData.startTime).tz(TZ);

    const dateStr = startTime.format('dddd, DD [de] MMMM');
    const timeStr = startTime.format('HH:mm');
    const name    = contactName ? ` ${contactName.split(' ')[0]}` : '';

    let message;

    if (type === '24h') {
      // Lembrete de 24h: inclui pergunta de confirmação
      let locationLine = '';
      if (appointmentData.meetingLink) {
        locationLine = `\n🔗 Link: ${appointmentData.meetingLink}`;
      } else if (appointmentData.location) {
        locationLine = `\n📍 Local: ${appointmentData.location}`;
      }

      message = `Olá${name}! 👋 Lembrete do seu agendamento:\n\n` +
        `📅 *${appointmentData.title || 'Agendamento'}*\n` +
        `🗓 ${dateStr}\n` +
        `🕐 ${timeStr}${locationLine}\n\n` +
        `Você confirma sua presença? Responda *SIM* para confirmar ou *NÃO* para cancelar. 😊`;

    } else {
      // Lembrete de 1h: mais curto e direto
      message = `⏰ Lembrete${name ? ` para ${name.trim()}` : ''}! Seu agendamento *${appointmentData.title || ''}* começa em aproximadamente 1 hora (${timeStr}). Até logo! 😊`;
    }

    // Envia a mensagem de lembrete
    await sendMessageWithDelay({ evolutionUrl, evolutionKey, clientId, phone, text: message });

    // Marca o lembrete como enviado no banco
    const updateField = type === '24h' ? 'reminder_24h_sent' : 'reminder_1h_sent';
    await supabase
      .from('appointments')
      .update({ [updateField]: true })
      .eq('id', appointmentId);

    // Salva a mensagem no histórico da conversa
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_id', clientId)
      .eq('contact_id', contactId)
      .in('status', ['open', 'waiting_human', 'human_active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (conversation) {
      await saveOutboundMessage({
        conversationId: conversation.id,
        clientId,
        contactId,
        content: message,
        sender: 'ai',
      });
    }

    await logEvent(clientId, `reminder_${type}_sent`, { appointmentId, phone });
    logger.info(`[Reminder] ✅ Lembrete ${type} enviado: ${phone}`);

  } catch (err) {
    logger.error(`[Reminder] Falha no lembrete ${type} para ${phone}:`, err.message);
    throw err;
  }
}

// ─── PROCESSAR RESPOSTA DO LEMBRETE ──────────────────────────────────────────

/**
 * Chamado pelo message.processor quando o cliente responde a um lembrete de 24h.
 * Detecta SIM/NÃO e age de acordo.
 *
 * @returns {string|null} - Resposta a enviar, ou null se não era resposta de lembrete
 */
export async function handleReminderReply(clientId, contactId, messageText) {
  const text = messageText.toLowerCase().trim();

  // Busca agendamento pendente de confirmação
  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, title, start_time, clients(evolution_api_url, evolution_api_key, calendly_event_url)')
    .eq('client_id', clientId)
    .eq('contact_id', contactId)
    .eq('status', 'scheduled')
    .eq('reminder_24h_sent', true)
    .eq('reminder_1h_sent', false) // só antes do lembrete de 1h
    .gt('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(1)
    .single();

  if (!appointment) return null; // Sem agendamento pendente — fluxo normal da IA

  const isConfirm = ['sim', 's', 'yes', 'confirmo', 'confirmado', 'vou', '✅', '👍'].some(w => text.includes(w));
  const isCancel  = ['não', 'nao', 'n', 'no', 'cancelar', 'cancelei', 'cancela', '❌', '👎'].some(w => text.includes(w));

  if (isConfirm) {
    await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', appointment.id);
    await logEvent(clientId, 'appointment_confirmed', { appointmentId: appointment.id });
    return `✅ Presença confirmada! Te esperamos. Até amanhã! 😊`;
  }

  if (isCancel) {
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appointment.id);
    await logEvent(clientId, 'appointment_cancelled_by_contact', { appointmentId: appointment.id });

    // Oferece reagendamento
    const client = appointment.clients;
    const rescheduleLink = client?.calendly_event_url;
    if (rescheduleLink) {
      return `Tudo bem! Cancelamos seu agendamento. 😊\n\nSe quiser remarcar, é só clicar aqui:\n${rescheduleLink}`;
    }
    return `Tudo bem! Cancelamos seu agendamento. Se quiser remarcar, é só me avisar! 😊`;
  }

  return null; // Não era SIM nem NÃO — deixa a IA responder normalmente
}
