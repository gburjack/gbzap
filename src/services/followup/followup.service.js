// src/services/followup/followup.service.js
// Gerencia o follow-up automático de contatos que pararam de responder.
//
// Lógica:
//   1. Cron (a cada 30min) chama checkAndScheduleFollowUps()
//   2. Busca contatos com last_seen_at expirado que não receberam follow-up
//   3. Enfileira jobs na followUpQueue com delay configurado pelo cliente
//   4. Worker processa cada job: gera mensagem personalizada e envia
//   5. Limita ao número máximo de tentativas configurado (ex: 2 tentativas)

import dayjs from 'dayjs';
import { supabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { followUpQueue } from '../../queues/queues.js';
import { generateAiResponse } from '../ai/ai.service.js';
import { sendMessageWithDelay } from '../whatsapp/evolution.service.js';
import { saveOutboundMessage } from '../whatsapp/conversation.service.js';

// ─── AGENDADOR (chamado pelo cron) ────────────────────────────────────────────

/**
 * Verifica todos os clientes e enfileira follow-ups necessários.
 * Executado a cada 30 minutos pelo cron.
 */
export async function checkAndScheduleFollowUps() {
  logger.info('[FollowUp] Verificando contatos pendentes...');

  try {
    // Busca todos os clientes ativos com follow-up habilitado
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, followup_enabled, followup_delay_h, followup_delay2_h, followup_max_attempts, followup_message, groq_api_key, gemini_api_key, evolution_api_url, evolution_api_key, agent_name, business_name')
      .eq('status', 'active')
      .eq('followup_enabled', true);

    if (error) throw error;
    if (!clients?.length) return;

    let totalScheduled = 0;

    for (const client of clients) {
      const scheduled = await scheduleFollowUpsForClient(client);
      totalScheduled += scheduled;
    }

    logger.info(`[FollowUp] ${totalScheduled} follow-up(s) enfileirado(s)`);
  } catch (err) {
    logger.error('[FollowUp] Erro ao verificar follow-ups:', err.message);
  }
}

async function scheduleFollowUpsForClient(client) {
  const maxAttempts = client.followup_max_attempts || 2;
  const delay1h     = client.followup_delay_h  || 2;   // horas até 1ª tentativa
  const delay2h     = client.followup_delay2_h || 24;  // horas até 2ª tentativa
  const now         = dayjs();

  // Limiar para 1ª tentativa: last_seen_at + delay1h
  const threshold1  = now.subtract(delay1h, 'hour').toISOString();
  // Limiar para 2ª tentativa: last_seen_at + delay2h
  const threshold2  = now.subtract(delay2h, 'hour').toISOString();

  // Busca contatos que:
  // - Pertencem a este cliente
  // - Estão com IA ativa (ai_controlled = true)
  // - Não receberam follow-up ainda (followup_count < maxAttempts)
  // - Last_seen_at passou do limiar
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, phone, name, followup_count, followup_sent_at, last_seen_at, funnel_stage')
    .eq('client_id', client.id)
    .eq('ai_controlled', true)
    .lt('followup_count', maxAttempts)
    .not('last_seen_at', 'is', null);

  if (!contacts?.length) return 0;

  let scheduled = 0;

  for (const contact of contacts) {
    const lastSeen     = dayjs(contact.last_seen_at);
    const attemptCount = contact.followup_count || 0;

    // Determina se está na hora do follow-up
    let shouldFollowUp = false;

    if (attemptCount === 0 && lastSeen.isBefore(dayjs(threshold1))) {
      shouldFollowUp = true;
    } else if (attemptCount === 1 && contact.followup_sent_at) {
      // 2ª tentativa: delay a partir do último follow-up enviado
      const lastSentAt = dayjs(contact.followup_sent_at);
      if (lastSentAt.isBefore(now.subtract(delay2h - delay1h, 'hour'))) {
        shouldFollowUp = true;
      }
    }

    if (!shouldFollowUp) continue;

    // Verifica se já tem job enfileirado para este contato (evita duplicatas)
    const jobId = `followup:${client.id}:${contact.id}:${attemptCount + 1}`;
    const existingJob = await followUpQueue.getJob(jobId);
    if (existingJob) continue;

    // Enfileira o follow-up
    await followUpQueue.add(
      {
        clientId:      client.id,
        contactId:     contact.id,
        phone:         contact.phone,
        contactName:   contact.name,
        funnelStage:   contact.funnel_stage,
        attemptNumber: attemptCount + 1,
        customMessage: client.followup_message,
        // Passa as configs de API do cliente
        groqApiKey:    client.groq_api_key,
        geminiApiKey:  client.gemini_api_key,
        evolutionUrl:  client.evolution_api_url,
        evolutionKey:  client.evolution_api_key,
        agentName:     client.agent_name,
        businessName:  client.business_name,
      },
      {
        jobId,
        delay: 0, // já passou do limiar, enviar agora
      }
    );

    scheduled++;
    logger.info(`[FollowUp] Enfileirado: ${contact.phone} (tentativa ${attemptCount + 1})`);
  }

  return scheduled;
}

// ─── WORKER (processa cada job) ───────────────────────────────────────────────

/**
 * Processa um job de follow-up da fila.
 * Gera mensagem personalizada com IA e envia pelo WhatsApp.
 */
export async function processFollowUpJob(job) {
  const {
    clientId, contactId, phone, contactName, funnelStage,
    attemptNumber, customMessage, groqApiKey, geminiApiKey,
    evolutionUrl, evolutionKey, agentName, businessName,
  } = job.data;

  logger.info(`[FollowUp] Processando: ${phone} (tentativa ${attemptNumber})`);

  try {
    let messageText;

    // Se cliente configurou mensagem customizada: usa ela
    // Senão: gera uma mensagem personalizada com IA
    if (customMessage && customMessage.trim()) {
      messageText = customMessage
        .replace('{nome}', contactName || 'você')
        .replace('{empresa}', businessName || 'nós');
    } else {
      messageText = await generateFollowUpMessage({
        groqApiKey, geminiApiKey,
        contactName, funnelStage, attemptNumber, agentName, businessName,
      });
    }

    // Envia a mensagem
    await sendMessageWithDelay({
      evolutionUrl,
      evolutionKey,
      clientId,
      phone,
      text: messageText,
    });

    // Atualiza o contador e timestamp do follow-up no banco
    await supabase
      .from('contacts')
      .update({
        followup_count:   attemptNumber,
        followup_sent_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    // Busca a conversa aberta mais recente para salvar a mensagem
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_id', clientId)
      .eq('contact_id', contactId)
      .in('status', ['open', 'waiting_human'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (conversation) {
      await saveOutboundMessage({
        conversationId: conversation.id,
        clientId,
        contactId,
        content: messageText,
        sender: 'ai',
      });
    }

    logger.info(`[FollowUp] ✅ Enviado para ${phone} (tentativa ${attemptNumber})`);
  } catch (err) {
    logger.error(`[FollowUp] Falha ao enviar para ${phone}:`, err.message);
    throw err; // Re-throw para Bull marcar como falha e fazer retry
  }
}

// ─── GERADOR DE MENSAGEM COM IA ───────────────────────────────────────────────

async function generateFollowUpMessage({
  groqApiKey, geminiApiKey,
  contactName, funnelStage, attemptNumber, agentName, businessName,
}) {
  const funnelContext = {
    new:         'O contato acabou de conhecer o negócio mas não finalizou o interesse.',
    interest:    'O contato demonstrou interesse mas parou de responder.',
    negotiation: 'O contato estava em negociação mas sumiu.',
    closed:      'O contato fechou uma compra e pode ter dúvidas pós-venda.',
    post_sale:   'O contato é cliente e pode precisar de suporte.',
  };

  const isSecondAttempt = attemptNumber > 1;

  const prompt = `Você é ${agentName || 'a assistente virtual'} de ${businessName || 'uma empresa'}.

Crie uma mensagem de follow-up para WhatsApp para um cliente que parou de responder.

Contexto:
- Nome do cliente: ${contactName || 'não informado'}
- Estágio no funil: ${funnelContext[funnelStage] || 'interesse demonstrado'}
- Tentativa: ${attemptNumber}ª mensagem de follow-up
${isSecondAttempt ? '- Esta é a última tentativa, seja mais direto e crie um senso de urgência leve.' : ''}

Regras:
- Seja natural, não invasivo e amigável
- Máximo 3 linhas curtas
- Inclua uma pergunta aberta ou call-to-action claro
- Não mencione que é um follow-up automático
- Use emojis com moderação
- Escreva em português do Brasil

Retorne APENAS o texto da mensagem, sem aspas ou explicações.`;

  try {
    const result = await generateAiResponse({
      groqApiKey,
      geminiApiKey,
      systemPrompt: 'Você cria mensagens de follow-up para WhatsApp. Seja direto e natural.',
      messages: [{ role: 'user', content: prompt }],
    });
    return result.text;
  } catch (err) {
    // Fallback: mensagem padrão se a IA falhar
    logger.warn('[FollowUp] IA indisponível, usando mensagem padrão');
    const name = contactName ? ` ${contactName.split(' ')[0]}` : '';
    return isSecondAttempt
      ? `Oi${name}! 👋 Ainda estou por aqui caso queira dar continuidade à nossa conversa. Posso te ajudar com mais alguma coisa?`
      : `Olá${name}! Tudo bem? Estava pensando em você — ficou com alguma dúvida que posso ajudar a esclarecer? 😊`;
  }
}
