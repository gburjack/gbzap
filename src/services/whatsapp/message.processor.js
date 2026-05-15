// src/services/whatsapp/message.processor.js
// ═══════════════════════════════════════════════════════════════
// PROCESSADOR CENTRAL DE MENSAGENS — o coração do GbZap
//
// Fluxo de cada mensagem recebida:
//
//  1. Recebe payload do webhook da Evolution API
//  2. Identifica o cliente pelo clientId da URL
//  3. Busca/cria contato e conversa
//  4. Processa a mídia (se houver): áudio → texto, imagem → descrição
//  5. Salva mensagem no banco
//  6. Verifica modo atual (IA / humano / fechado)
//  7. Se IA: monta histórico + system prompt → chama IA → envia resposta
//  8. Se humano: notifica atendente, aguarda
//  9. Atualiza funil, detecta gaps, registra logs
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { buildSystemPrompt, needsHumanTransfer, isAiGap } from '../../utils/prompt.utils.js';
import { getCurrentMode, getClientWithSchedules } from '../../utils/schedule.utils.js';
import { generateAiResponse } from '../ai/ai.service.js';
import { processMediaMessage } from '../media/media.service.js';
import {
  sendMessageWithDelay,
  sendTextMessage,
  checkWarmupLimit,
} from './evolution.service.js';
import {
  getOrCreateContact,
  getOrCreateConversation,
  getConversationHistory,
  saveInboundMessage,
  saveOutboundMessage,
  autoUpdateFunnelStage,
  recordAiGap,
  updateConversationStatus,
  logEvent,
} from './conversation.service.js';
import { handleReminderReply } from '../reminders/reminder.service.js';

// ─── PARSER DO PAYLOAD DA EVOLUTION API ──────────────────────────────────────

/**
 * Normaliza o payload bruto da Evolution API para um formato interno.
 * A Evolution pode enviar mensagens de vários tipos em estruturas diferentes.
 */
function parseEvolutionMessage(payload) {
  const msg  = payload.data?.message || payload.data || {};
  const key  = payload.data?.key || {};
  const info = payload.data?.messageTimestamp;

  // Tipo da mensagem
  const types = [
    'conversation',       // texto simples
    'extendedTextMessage', // texto com link preview
    'audioMessage',        // áudio
    'imageMessage',        // imagem
    'documentMessage',     // documento/PDF
    'videoMessage',        // vídeo
    'locationMessage',     // localização
    'stickerMessage',      // sticker
    'pttMessage',          // voz (push-to-talk)
  ];

  let messageType = 'text';
  let content     = '';
  let mediaUrl    = null;
  let mediaBuffer = null;
  let fileName    = null;
  let caption     = null;
  let latitude    = null;
  let longitude   = null;
  let locationName    = null;
  let locationAddress = null;

  if (msg.conversation || msg.extendedTextMessage?.text) {
    messageType = 'text';
    content     = msg.conversation || msg.extendedTextMessage?.text || '';
  } else if (msg.audioMessage || msg.pttMessage) {
    messageType = 'audio';
    mediaUrl    = msg.audioMessage?.url || msg.pttMessage?.url;
    // Evolution com base64: true envia o buffer diretamente
    if (payload.data?.base64) {
      mediaBuffer = Buffer.from(payload.data.base64, 'base64');
    }
  } else if (msg.imageMessage) {
    messageType = 'image';
    caption     = msg.imageMessage.caption;
    mediaUrl    = msg.imageMessage.url;
    if (payload.data?.base64) {
      mediaBuffer = Buffer.from(payload.data.base64, 'base64');
    }
  } else if (msg.documentMessage) {
    messageType = 'document';
    fileName    = msg.documentMessage.fileName;
    mediaUrl    = msg.documentMessage.url;
  } else if (msg.videoMessage) {
    messageType = 'video';
    mediaUrl    = msg.videoMessage.url;
  } else if (msg.locationMessage) {
    messageType = 'location';
    latitude        = msg.locationMessage.degreesLatitude;
    longitude       = msg.locationMessage.degreesLongitude;
    locationName    = msg.locationMessage.name;
    locationAddress = msg.locationMessage.address;
  } else if (msg.stickerMessage) {
    messageType = 'sticker';
  }

  return {
    evolutionId:    key.id,
    phone:          key.remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', ''),
    fromMe:         key.fromMe || false,
    pushName:       payload.data?.pushName || null,
    messageType,
    content,
    mediaUrl,
    mediaBuffer,
    fileName,
    caption,
    latitude,
    longitude,
    locationName,
    locationAddress,
    timestamp:      info ? new Date(info * 1000) : new Date(),
  };
}

// ─── PROCESSADOR PRINCIPAL ────────────────────────────────────────────────────

/**
 * Ponto de entrada principal — chamado pelo webhook.
 *
 * @param {string} clientId  - UUID do cliente GbZap
 * @param {object} payload   - Body bruto do webhook da Evolution
 */
export async function processIncomingMessage(clientId, payload) {
  // ── 1. Parseia a mensagem ──────────────────────────────────
  const parsed = parseEvolutionMessage(payload);

  // Ignora mensagens enviadas pelo próprio bot, grupos e status
  if (parsed.fromMe) return;
  if (!parsed.phone)  return;
  if (parsed.phone.includes('g.us') || parsed.phone === 'status@broadcast') return;

  logger.info(`📨 Mensagem recebida | cliente: ${clientId} | de: ${parsed.phone} | tipo: ${parsed.messageType}`);

  try {
    // ── 2. Busca dados do cliente (com horários e feriados) ───
    const { client, schedules, holidays } = await getClientWithSchedules(clientId);

    if (!client) {
      logger.error(`Cliente não encontrado: ${clientId}`);
      return;
    }

    // ── 3. Busca/cria contato e conversa ──────────────────────
    const contact      = await getOrCreateContact(clientId, parsed.phone, parsed.pushName);
    const conversation = await getOrCreateConversation(clientId, contact.id);

    // ── 4. Processa mídia (se necessário) ────────────────────
    let textContent = parsed.content;

    if (parsed.messageType !== 'text') {
      const mediaResult = await processMediaMessage(
        {
          mediaType:       parsed.messageType,
          mediaUrl:        parsed.mediaUrl,
          mediaBuffer:     parsed.mediaBuffer,
          caption:         parsed.caption,
          fileName:        parsed.fileName,
          latitude:        parsed.latitude,
          longitude:       parsed.longitude,
          locationName:    parsed.locationName,
          locationAddress: parsed.locationAddress,
        },
        client
      );
      textContent = mediaResult.processedText;
    }

    // ── 5. Salva mensagem recebida no banco ───────────────────
    await saveInboundMessage({
      conversationId: conversation.id,
      clientId,
      contactId:      contact.id,
      content:        parsed.content || textContent,
      mediaType:      parsed.messageType,
      mediaUrl:       parsed.mediaUrl,
      mediaProcessed: parsed.messageType !== 'text' ? textContent : null,
      evolutionId:    parsed.evolutionId,
    });

    // ── 6. Verifica modo de operação atual ────────────────────
    const currentMode = await getCurrentMode(client, schedules, holidays);

    // ── 7. Conversa está com humano ativo (takeover) ──────────
    if (!contact.ai_controlled || conversation.status === 'human_active') {
      logger.info(`Conversa ${conversation.id} em modo humano — IA pausada`);
      await logEvent(clientId, 'message_human_mode', { phone: parsed.phone });
      return; // Humano vai responder manualmente pelo painel
    }

    // ── 8. Fora do horário de atendimento ─────────────────────
    if (currentMode === 'closed') {
      const closedMsg = `Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve. 😊`;
      await sendMessageWithDelay({
        evolutionUrl: client.evolution_api_url,
        evolutionKey: client.evolution_api_key,
        clientId,
        phone:        parsed.phone,
        text:         closedMsg,
      });
      return;
    }

    // ── 9. Modo humano (horário comercial) ────────────────────
    if (currentMode === 'human') {
      // Notifica que tem mensagem aguardando (via log — painel mostra)
      await updateConversationStatus(conversation.id, 'waiting_human');
      await logEvent(clientId, 'message_waiting_human', {
        phone:          parsed.phone,
        conversationId: conversation.id,
        preview:        textContent?.substring(0, 100),
      });
      logger.info(`Mensagem aguardando humano: conversa ${conversation.id}`);

      // Se modo de transição for invisível, a IA pode responder brevemente
      // até o humano assumir. Por ora: só notifica.
      return;
    }

    // ── 10. Verifica resposta a lembrete de agendamento (SIM/NÃO) ──
    if (parsed.messageType === 'text' && textContent) {
      const reminderReply = await handleReminderReply(clientId, contact.id, textContent);
      if (reminderReply) {
        await sendMessageWithDelay({
          evolutionUrl: client.evolution_api_url,
          evolutionKey: client.evolution_api_key,
          clientId,
          phone: parsed.phone,
          text:  reminderReply,
        });
        await saveOutboundMessage({
          conversationId: conversation.id,
          clientId,
          contactId:      contact.id,
          content:        reminderReply,
          sender:         'ai',
        });
        return;
      }
    }

    // ── 10. Modo IA — gera resposta ───────────────────────────

    // Verifica aquecimento do número
    const warmup = await checkWarmupLimit(client);
    if (!warmup.canSend) {
      logger.warn(`Limite de aquecimento atingido (${warmup.sentToday}/${warmup.dailyLimit}). Pulando resposta.`);
      return;
    }

    // Busca histórico da conversa (memória de curto prazo)
    const history = await getConversationHistory(conversation.id, 20);

    // Adiciona a mensagem atual ao histórico
    const messages = [
      ...history,
      { role: 'user', content: textContent },
    ];

    // Monta o system prompt com toda a base de conhecimento do cliente
    const systemPrompt = buildSystemPrompt(client, contact);

    // Chama a IA (Groq com fallback para Gemini)
    let aiResult;
    try {
      aiResult = await generateAiResponse({
        groqApiKey:   client.groq_api_key,
        geminiApiKey: client.gemini_api_key,
        systemPrompt,
        messages,
      });
    } catch (aiErr) {
      logger.error(`Falha total na IA para cliente ${clientId}:`, aiErr.message);

      // Fallback de emergência: mensagem humana
      await sendTextMessage({
        evolutionUrl: client.evolution_api_url,
        evolutionKey: client.evolution_api_key,
        clientId,
        phone:        parsed.phone,
        text:         'Olá! Estou com uma instabilidade temporária. Em breve retornarei. 😊',
      });

      await logEvent(clientId, 'ai_total_failure', { error: aiErr.message, phone: parsed.phone });
      return;
    }

    // ── 11. Pós-processamento da resposta da IA ───────────────

    // Detecta se a IA quer transferir para humano
    if (needsHumanTransfer(aiResult.text)) {
      await updateConversationStatus(conversation.id, 'waiting_human');
      await logEvent(clientId, 'human_transfer_requested', {
        phone:          parsed.phone,
        conversationId: conversation.id,
      });
      logger.info(`Transferência para humano solicitada: ${parsed.phone}`);
    }

    // Detecta gaps de conhecimento (para o cliente melhorar a base)
    if (isAiGap(aiResult.text)) {
      await recordAiGap(clientId, contact.id, textContent, aiResult.text);
      logger.info(`Gap de conhecimento registrado para cliente ${clientId}`);
    }

    // ── 12. Envia a resposta com delay natural ────────────────
    await sendMessageWithDelay({
      evolutionUrl: client.evolution_api_url,
      evolutionKey: client.evolution_api_key,
      clientId,
      phone:        parsed.phone,
      text:         aiResult.text,
    });

    // ── 13. Salva resposta da IA no banco ─────────────────────
    await saveOutboundMessage({
      conversationId:  conversation.id,
      clientId,
      contactId:       contact.id,
      content:         aiResult.text,
      sender:          'ai',
      aiModel:         aiResult.model,
      promptTokens:    aiResult.tokens.prompt,
      completionTokens: aiResult.tokens.completion,
    });

    // ── 14. Atualiza funil automaticamente (assíncrono) ───────
    // Não bloqueia o fluxo principal — roda em background
    const updatedHistory = [...messages, { role: 'assistant', content: aiResult.text }];
    autoUpdateFunnelStage(contact, updatedHistory, client).catch(err =>
      logger.warn('Erro ao atualizar funil:', err.message)
    );

    await logEvent(clientId, 'message_ai_responded', {
      phone:  parsed.phone,
      model:  aiResult.model,
      tokens: aiResult.tokens.completion,
    });

    logger.info(`✅ Resposta enviada → ${parsed.phone} via ${aiResult.model}`);

  } catch (err) {
    logger.error(`Erro crítico ao processar mensagem (cliente: ${clientId}):`, err.message, err.stack);
    await logEvent(clientId, 'message_processing_error', { error: err.message, phone: parsed.phone });
  }
}
