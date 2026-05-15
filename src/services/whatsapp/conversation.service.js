// src/services/whatsapp/conversation.service.js
// Gerencia o ciclo de vida das conversas:
// - Busca ou cria contato/conversa
// - Salva mensagens no banco
// - Recupera histórico para contexto da IA
// - Atualiza funil e perfil do contato

import { supabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { quickClassify } from '../ai/ai.service.js';

// ─── CONTATO ──────────────────────────────────────────────────────────────────

/**
 * Busca ou cria um contato pelo número de telefone.
 * Atualiza last_seen_at e zera contador de follow-up a cada nova mensagem.
 */
export async function getOrCreateContact(clientId, phone, name = null) {
  // Tenta buscar contato existente
  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .single();

  if (existing) {
    // Atualiza last_seen e nome se tiver
    const updates = {
      last_seen_at:    new Date().toISOString(),
      followup_count:  0,    // cliente voltou → resetar follow-up
      followup_sent_at: null,
    };
    if (name && !existing.name) updates.name = name;

    await supabase.from('contacts').update(updates).eq('id', existing.id);
    return { ...existing, ...updates };
  }

  // Cria novo contato
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      client_id:   clientId,
      phone,
      name:        name || null,
      funnel_stage: 'new',
      ai_controlled: true,
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  logger.info(`Novo contato criado: ${phone} para cliente ${clientId}`);
  return newContact;
}

// ─── CONVERSA ─────────────────────────────────────────────────────────────────

/**
 * Busca a conversa aberta ativa ou cria uma nova.
 * Uma conversa é "ativa" se foi criada nas últimas 24h e está aberta.
 * Após 24h de inatividade, abre uma nova sessão.
 */
export async function getOrCreateConversation(clientId, contactId, channel = 'whatsapp') {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Busca conversa aberta recente
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .eq('contact_id', contactId)
    .eq('channel', channel)
    .in('status', ['open', 'waiting_human', 'human_active'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing;

  // Abre nova conversa
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      client_id:  clientId,
      contact_id: contactId,
      channel,
      status:     'open',
    })
    .select()
    .single();

  if (error) throw error;

  logger.info(`Nova conversa aberta: ${newConv.id}`);
  return newConv;
}

// ─── HISTÓRICO DE MENSAGENS ───────────────────────────────────────────────────

/**
 * Recupera as últimas N mensagens da conversa para passar como contexto para a IA.
 * Retorna no formato esperado pela API de IA (role + content).
 */
export async function getConversationHistory(conversationId, limit = 20) {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('direction, sender, content, media_processed, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Erro ao buscar histórico:', error.message);
    return [];
  }

  // Reverte para ordem cronológica e converte para formato de IA
  return (messages || [])
    .reverse()
    .map(msg => ({
      role:    msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.media_processed || msg.content || '',
    }))
    .filter(m => m.content.trim()); // remove mensagens vazias
}

// ─── SALVAR MENSAGENS ─────────────────────────────────────────────────────────

/**
 * Salva uma mensagem recebida (inbound) no banco.
 */
export async function saveInboundMessage({
  conversationId, clientId, contactId,
  content, mediaType, mediaUrl, mediaProcessed, evolutionId,
}) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      client_id:       clientId,
      contact_id:      contactId,
      direction:       'inbound',
      sender:          'contact',
      content,
      media_type:      mediaType || 'text',
      media_url:       mediaUrl || null,
      media_processed: mediaProcessed || null,
      evolution_id:    evolutionId || null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Salva uma resposta gerada pela IA (outbound).
 */
export async function saveOutboundMessage({
  conversationId, clientId, contactId,
  content, sender = 'ai', aiModel, promptTokens, completionTokens,
}) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id:      conversationId,
      client_id:            clientId,
      contact_id:           contactId,
      direction:            'outbound',
      sender,
      content,
      media_type:           'text',
      ai_model_used:        aiModel || null,
      ai_prompt_tokens:     promptTokens || 0,
      ai_completion_tokens: completionTokens || 0,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

// ─── FUNIL E PERFIL ───────────────────────────────────────────────────────────

/**
 * Classifica automaticamente o estágio do funil com base na conversa.
 * Usa o modelo leve (Llama 8B) para não gastar tokens do modelo principal.
 */
export async function autoUpdateFunnelStage(contact, conversationHistory, client) {
  // Só atualiza se ainda está no estágio inicial
  if (!['new', 'interest'].includes(contact.funnel_stage)) return;

  const lastMessages = conversationHistory
    .slice(-6) // só as últimas 6 mensagens
    .map(m => `${m.role === 'user' ? 'Cliente' : 'Agente'}: ${m.content}`)
    .join('\n');

  const prompt = `Com base nas últimas mensagens abaixo, classifique o estágio do cliente no funil de vendas.

Mensagens:
${lastMessages}

Estágios possíveis:
- new: primeiro contato, sem interesse claro ainda
- interest: demonstrou interesse em produto/serviço
- negotiation: está negociando, pedindo condições, comparando
- closed: fechou compra ou agendamento
- post_sale: é cliente, está em pós-venda ou suporte

Responda APENAS com uma dessas palavras: new, interest, negotiation, closed, post_sale`;

  try {
    const result = await quickClassify({
      groqApiKey:   client.groq_api_key,
      geminiApiKey: client.gemini_api_key,
      prompt,
    });

    const stage = result.text.trim().toLowerCase();
    const validStages = ['new', 'interest', 'negotiation', 'closed', 'post_sale'];

    if (validStages.includes(stage) && stage !== contact.funnel_stage) {
      await supabase
        .from('contacts')
        .update({ funnel_stage: stage })
        .eq('id', contact.id);

      logger.info(`Funil atualizado: ${contact.phone} → ${stage}`);
    }
  } catch (err) {
    // Não crítico — não bloqueia o atendimento
    logger.warn('Falha ao classificar funil:', err.message);
  }
}

/**
 * Registra uma mensagem que a IA não soube responder (ai_gap).
 */
export async function recordAiGap(clientId, contactId, messageContent, aiResponse) {
  await supabase.from('ai_gaps').insert({
    client_id:       clientId,
    contact_id:      contactId,
    message_content: messageContent,
    ai_response:     aiResponse,
  });
}

/**
 * Atualiza o status de uma conversa.
 */
export async function updateConversationStatus(conversationId, status) {
  await supabase
    .from('conversations')
    .update({ status, ...(status === 'closed' ? { closed_at: new Date().toISOString() } : {}) })
    .eq('id', conversationId);
}

/**
 * Registra um evento de log no banco.
 */
export async function logEvent(clientId, eventType, payload = {}) {
  await supabase.from('activity_logs').insert({
    client_id:  clientId,
    event_type: eventType,
    payload,
  });
}
