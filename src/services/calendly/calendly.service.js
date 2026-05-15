// src/services/calendly/calendly.service.js
// Integração completa com a API do Calendly:
// - Consultar disponibilidade
// - Criar agendamentos
// - Processar webhooks de confirmação
// - Gerenciar lembretes via Bull Queue (Fase 4)

import fetch from 'node-fetch';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { sendMessageWithDelay } from '../whatsapp/evolution.service.js';

dayjs.locale('pt-br');

// ─── API DO CALENDLY ──────────────────────────────────────────────────────────

function calendlyHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Busca os tipos de eventos disponíveis do cliente no Calendly.
 * Retorna lista simplificada com nome, duração e URL de agendamento.
 */
export async function getAvailableEventTypes(calendlyApiKey) {
  try {
    // Primeiro busca o usuário atual
    const userRes  = await fetch('https://api.calendly.com/users/me', {
      headers: calendlyHeaders(calendlyApiKey),
    });
    const userData = await userRes.json();

    if (!userRes.ok) throw new Error(`Calendly user error: ${JSON.stringify(userData)}`);

    const userUri = userData.resource?.uri;

    // Busca os event types do usuário
    const eventsRes  = await fetch(`https://api.calendly.com/event_types?user=${userUri}&active=true`, {
      headers: calendlyHeaders(calendlyApiKey),
    });
    const eventsData = await eventsRes.json();

    if (!eventsRes.ok) throw new Error(`Calendly events error: ${JSON.stringify(eventsData)}`);

    return (eventsData.collection || []).map(e => ({
      uri:           e.uri,
      name:          e.name,
      duration:      e.duration,
      schedulingUrl: e.scheduling_url,
      description:   e.description_plain,
    }));
  } catch (err) {
    logger.error('Erro ao buscar event types Calendly:', err.message);
    throw err;
  }
}

/**
 * Retorna o link de agendamento configurado pelo cliente.
 * Simples: o cliente cadastra a URL do seu Calendly no painel.
 */
export function getSchedulingLink(client) {
  return client.calendly_event_url || null;
}

/**
 * Formata uma mensagem de agendamento para enviar pelo WhatsApp.
 */
export function buildSchedulingMessage(client) {
  const link = getSchedulingLink(client);

  if (!link) {
    return 'Para agendar, entre em contato com nossa equipe.';
  }

  return `📅 *Agendamento*\n\nAcesse o link abaixo para escolher o melhor horário para você:\n\n${link}\n\nApós confirmar, você receberá uma mensagem de confirmação aqui! 😊`;
}

// ─── PROCESSADOR DO WEBHOOK DO CALENDLY ──────────────────────────────────────

/**
 * Processa eventos recebidos do webhook do Calendly.
 * Eventos suportados:
 * - invitee.created  → agendamento confirmado
 * - invitee.canceled → agendamento cancelado
 */
export async function processCalendlyWebhook(clientId, payload) {
  const eventType = payload.event;
  const invitee   = payload.payload?.invitee;
  const event     = payload.payload?.event;

  if (!invitee || !event) {
    logger.warn(`Webhook Calendly sem dados de invitee/event (cliente: ${clientId})`);
    return;
  }

  // Busca o cliente
  const { data: client } = await supabase
    .from('clients')
    .select('id, evolution_api_url, evolution_api_key, agent_name, business_name')
    .eq('id', clientId)
    .single();

  if (!client) {
    logger.error(`Cliente não encontrado para webhook Calendly: ${clientId}`);
    return;
  }

  // Extrai telefone do invitee (Calendly pode incluir nas respostas)
  const phone = extractPhoneFromInvitee(invitee);

  if (eventType === 'invitee.created') {
    await handleAppointmentCreated({ client, invitee, event, phone });
  } else if (eventType === 'invitee.canceled') {
    await handleAppointmentCanceled({ client, invitee, event, phone });
  }
}

async function handleAppointmentCreated({ client, invitee, event, phone }) {
  try {
    const startTime = dayjs(event.start_time);
    const endTime   = dayjs(event.end_time);

    // Formata data/hora em português
    const dateStr = startTime.format('dddd, DD [de] MMMM [de] YYYY');
    const timeStr = startTime.format('HH:mm');

    // Determina localização (presencial ou link)
    let locationInfo = '';
    if (event.location?.join_url) {
      locationInfo = `\n🔗 Link da reunião: ${event.location.join_url}`;
    } else if (event.location?.location) {
      locationInfo = `\n📍 Local: ${event.location.location}`;
    }

    // Salva no banco
    const { data: appointment } = await supabase
      .from('appointments')
      .upsert({
        client_id:         client.id,
        contact_id:        await getContactIdByPhone(client.id, phone),
        calendly_event_id: event.uri,
        calendly_event_url: invitee.uri,
        title:             event.name,
        start_time:        event.start_time,
        end_time:          event.end_time,
        location:          event.location?.location || null,
        meeting_link:      event.location?.join_url || null,
        status:            'scheduled',
      }, { onConflict: 'calendly_event_id' })
      .select()
      .single();

    logger.info(`Agendamento criado: ${event.name} em ${dateStr} ${timeStr}`);

    // Envia confirmação pelo WhatsApp (se tiver o telefone)
    if (phone && client.evolution_api_url) {
      const confirmMsg = `✅ *Agendamento Confirmado!*\n\n` +
        `📅 ${dateStr}\n` +
        `🕐 ${timeStr}${locationInfo}\n\n` +
        `Você receberá um lembrete 24h antes. Até lá! 😊`;

      await sendMessageWithDelay({
        evolutionUrl: client.evolution_api_url,
        evolutionKey: client.evolution_api_key,
        clientId:     client.id,
        phone,
        text:         confirmMsg,
      });
    }

    // TODO Fase 4: enfileirar lembretes de 24h e 1h na Bull Queue

  } catch (err) {
    logger.error('Erro ao processar agendamento criado:', err.message);
  }
}

async function handleAppointmentCanceled({ client, invitee, event, phone }) {
  try {
    // Atualiza status no banco
    await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('calendly_event_id', event.uri)
      .eq('client_id', client.id);

    logger.info(`Agendamento cancelado: ${event.uri}`);

    // Notifica o cliente pelo WhatsApp
    if (phone && client.evolution_api_url) {
      const cancelMsg = `⚠️ Seu agendamento foi cancelado.\n\n` +
        `Se quiser reagendar, é só me chamar! 😊`;

      await sendMessageWithDelay({
        evolutionUrl: client.evolution_api_url,
        evolutionKey: client.evolution_api_key,
        clientId:     client.id,
        phone,
        text:         cancelMsg,
      });
    }
  } catch (err) {
    logger.error('Erro ao processar cancelamento:', err.message);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Tenta extrair o telefone do invitee do Calendly.
 * O Calendly pode incluir o telefone nas "questions_and_answers" do evento.
 */
function extractPhoneFromInvitee(invitee) {
  if (!invitee.questions_and_answers) return null;

  for (const qa of invitee.questions_and_answers) {
    const q = qa.question?.toLowerCase() || '';
    if (q.includes('telefone') || q.includes('whatsapp') || q.includes('celular') || q.includes('phone')) {
      // Remove caracteres não numéricos
      const phone = qa.answer?.replace(/\D/g, '');
      if (phone && phone.length >= 10) {
        // Adiciona DDI 55 se não tiver
        return phone.startsWith('55') ? phone : `55${phone}`;
      }
    }
  }
  return null;
}

async function getContactIdByPhone(clientId, phone) {
  if (!phone) return null;
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .single();
  return data?.id || null;
}
