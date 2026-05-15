// src/services/whatsapp/evolution.service.js
// Interface completa com a Evolution API
// Gerencia instâncias por cliente, envio de mensagens e aquecimento de número

import fetch from 'node-fetch';
import { logger } from '../../utils/logger.js';
import { supabase } from '../../config/database.js';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function evolutionHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'apikey': apiKey,
  };
}

function instanceName(clientId) {
  // Nome da instância Evolution único por cliente
  return `gbzap_${clientId.replace(/-/g, '').substring(0, 16)}`;
}

// ─── ENVIO DE MENSAGENS ────────────────────────────────────────────────────────

/**
 * Envia uma mensagem de texto para um número no WhatsApp.
 *
 * @param {object} params
 * @param {string} params.evolutionUrl  - URL da Evolution API do cliente
 * @param {string} params.evolutionKey  - Chave da Evolution API do cliente
 * @param {string} params.clientId      - UUID do cliente (para nomear a instância)
 * @param {string} params.phone         - Número no formato '5511999999999'
 * @param {string} params.text          - Texto a enviar
 * @param {string} [params.quotedId]    - ID da mensagem a responder (opcional)
 */
export async function sendTextMessage({ evolutionUrl, evolutionKey, clientId, phone, text, quotedId }) {
  const name = instanceName(clientId);
  const url  = `${evolutionUrl}/message/sendText/${name}`;

  const body = {
    number: phone,
    text,
    ...(quotedId && { quoted: { key: { id: quotedId } } }),
  };

  try {
    const res  = await fetch(url, {
      method: 'POST',
      headers: evolutionHeaders(evolutionKey),
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Evolution sendText error ${res.status}: ${JSON.stringify(data)}`);
    }

    logger.info(`Mensagem enviada → ${phone} (${text.substring(0, 40)}...)`);
    return { success: true, messageId: data.key?.id };
  } catch (err) {
    logger.error(`Falha ao enviar mensagem para ${phone}:`, err.message);
    throw err;
  }
}

/**
 * Simula digitação antes de enviar uma mensagem.
 * Torna a conversa mais natural.
 */
export async function sendTyping({ evolutionUrl, evolutionKey, clientId, phone, durationMs = 2000 }) {
  const name = instanceName(clientId);

  try {
    await fetch(`${evolutionUrl}/chat/presence/${name}`, {
      method: 'POST',
      headers: evolutionHeaders(evolutionKey),
      body: JSON.stringify({
        number: phone,
        options: { presence: 'composing', delay: durationMs },
      }),
    });
  } catch (err) {
    // Não é crítico — continua sem o typing indicator
    logger.warn('Falha ao enviar typing indicator:', err.message);
  }
}

/**
 * Envia mensagem com delay natural baseado no tamanho do texto.
 * Combina: pausa → typing indicator → envio
 */
export async function sendMessageWithDelay({ evolutionUrl, evolutionKey, clientId, phone, text }) {
  // Calcula delay proporcional ao tamanho (simula digitação humana)
  // Mínimo: 1s | Máximo: 4s | ~50ms por caractere
  const typingMs = Math.min(4000, Math.max(1000, text.length * 50));

  await sendTyping({ evolutionUrl, evolutionKey, clientId, phone, durationMs: typingMs });

  // Aguarda o tempo de "digitação"
  await new Promise(r => setTimeout(r, typingMs + 300));

  return sendTextMessage({ evolutionUrl, evolutionKey, clientId, phone, text });
}

// ─── GERENCIAMENTO DE INSTÂNCIA ───────────────────────────────────────────────

/**
 * Cria uma nova instância na Evolution API para um cliente.
 * Chamado quando o cliente configura seu número pela primeira vez.
 */
export async function createInstance({ evolutionUrl, evolutionKey, clientId, webhookUrl }) {
  const name = instanceName(clientId);

  const body = {
    instanceName: name,
    integration: 'WHATSAPP-BAILEYS',
    webhook: {
      url: webhookUrl,
      byEvents: true,
      base64: true,   // Evolution envia mídias em base64 (evita URLs expiradas)
      events: [
        'MESSAGES_UPSERT',   // nova mensagem recebida
        'MESSAGES_UPDATE',   // status de entrega atualizado
        'CONNECTION_UPDATE',  // status da conexão
        'QRCODE_UPDATED',     // novo QR code gerado
      ],
    },
    qrcode: true,
    rejectCall: true,         // rejeita chamadas automáticas
    msgCall: 'Não realizamos atendimento por chamada. Por favor, envie uma mensagem!',
    groupsIgnore: true,       // ignora mensagens de grupos
    alwaysOnline: true,
    readMessages: true,       // marca mensagens como lidas automaticamente
    readStatus: false,
  };

  const res  = await fetch(`${evolutionUrl}/instance/create`, {
    method: 'POST',
    headers: evolutionHeaders(evolutionKey),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Falha ao criar instância: ${JSON.stringify(data)}`);
  }

  logger.info(`Instância Evolution criada: ${name}`);
  return data;
}

/**
 * Busca o QR Code atual de uma instância (para escanear no WhatsApp).
 */
export async function getQrCode({ evolutionUrl, evolutionKey, clientId }) {
  const name = instanceName(clientId);

  const res  = await fetch(`${evolutionUrl}/instance/connect/${name}`, {
    headers: evolutionHeaders(evolutionKey),
  });

  const data = await res.json();

  if (!res.ok) throw new Error(`Falha ao buscar QR: ${JSON.stringify(data)}`);

  return {
    qrcode: data.code,      // string base64 ou string para exibir como QR
    pairingCode: data.code, // código de pareamento alternativo
  };
}

/**
 * Verifica o status de conexão de uma instância.
 */
export async function getInstanceStatus({ evolutionUrl, evolutionKey, clientId }) {
  const name = instanceName(clientId);

  try {
    const res  = await fetch(`${evolutionUrl}/instance/connectionState/${name}`, {
      headers: evolutionHeaders(evolutionKey),
    });
    const data = await res.json();
    return {
      connected: data.instance?.state === 'open',
      state:     data.instance?.state || 'unknown',
    };
  } catch {
    return { connected: false, state: 'error' };
  }
}

/**
 * Deleta uma instância (usado ao trocar de número).
 * O histórico de conversas é preservado no banco de dados.
 */
export async function deleteInstance({ evolutionUrl, evolutionKey, clientId }) {
  const name = instanceName(clientId);

  const res = await fetch(`${evolutionUrl}/instance/delete/${name}`, {
    method: 'DELETE',
    headers: evolutionHeaders(evolutionKey),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(`Falha ao deletar instância: ${JSON.stringify(data)}`);
  }

  logger.info(`Instância Evolution deletada: ${name}`);
  return true;
}

// ─── AQUECIMENTO DE NÚMERO ────────────────────────────────────────────────────

/**
 * Verifica se o cliente pode enviar mais mensagens hoje baseado no aquecimento.
 * Retorna true se pode enviar, false se atingiu o limite do dia.
 *
 * Plano de aquecimento progressivo:
 * Dia 1: 20 msgs | Dia 2: 40 | Dia 3: 60 | Dia 4: 80 | Dia 5: 100
 * Dia 6: 150 | Dia 7: 200 | Dia 8+: sem limite
 */
export async function checkWarmupLimit(client) {
  if (!client.warmup_enabled) return { canSend: true };

  const WARMUP_SCHEDULE = [20, 40, 60, 80, 100, 150, 200];
  const warmupDay = client.warmup_day || 0;

  // Aquecimento completo após 7 dias
  if (warmupDay >= WARMUP_SCHEDULE.length) {
    return { canSend: true, warmupComplete: true };
  }

  const dailyLimit = WARMUP_SCHEDULE[warmupDay];
  const maxMsgs    = client.warmup_max_msgs || dailyLimit;

  // Conta mensagens enviadas hoje
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact' })
    .eq('client_id', client.id)
    .eq('direction', 'outbound')
    .gte('created_at', today.toISOString());

  const sentToday = count || 0;

  if (sentToday >= maxMsgs) {
    logger.warn(`Cliente ${client.id} atingiu limite de aquecimento: ${sentToday}/${maxMsgs}`);
    return {
      canSend:    false,
      sentToday,
      dailyLimit: maxMsgs,
      warmupDay,
    };
  }

  return { canSend: true, sentToday, dailyLimit: maxMsgs, warmupDay };
}

/**
 * Avança um dia no aquecimento (chamado pelo cron job diariamente).
 */
export async function advanceWarmupDay(clientId) {
  const { data: client } = await supabase
    .from('clients')
    .select('warmup_day, warmup_enabled')
    .eq('id', clientId)
    .single();

  if (!client?.warmup_enabled) return;

  const WARMUP_SCHEDULE = [20, 40, 60, 80, 100, 150, 200];
  const nextDay   = (client.warmup_day || 0) + 1;
  const nextLimit = WARMUP_SCHEDULE[nextDay] || 9999;

  await supabase
    .from('clients')
    .update({ warmup_day: nextDay, warmup_max_msgs: nextLimit })
    .eq('id', clientId);

  logger.info(`Aquecimento avançado — cliente ${clientId}: dia ${nextDay}, limite ${nextLimit}`);
}
