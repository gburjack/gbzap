// src/services/whatsapp/evolution.service.js
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
  return `gbzap_${clientId.replace(/-/g, '').substring(0, 16)}`;
}

// ─── ENVIO DE MENSAGENS ───────────────────────────────────────────────────────

export async function sendTextMessage({ evolutionUrl, evolutionKey, clientId, phone, text, quotedId }) {
  const name = instanceName(clientId);
  const url  = `${evolutionUrl}/message/sendText/${name}`;

  // Evolution API v1.8.2 exige o campo "textMessage" com "text" dentro
  const body = {
    number: phone,
    textMessage: { text },
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
    logger.error(`Falha ao enviar mensagem para ${phone}: ${err.message}`);
    throw err;
  }
}

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
    logger.warn('Falha ao enviar typing indicator:', err.message);
  }
}

export async function sendMessageWithDelay({ evolutionUrl, evolutionKey, clientId, phone, text }) {
  const typingMs = Math.min(4000, Math.max(1000, text.length * 50));

  await sendTyping({ evolutionUrl, evolutionKey, clientId, phone, durationMs: typingMs });
  await new Promise(r => setTimeout(r, typingMs + 300));

  return sendTextMessage({ evolutionUrl, evolutionKey, clientId, phone, text });
}

// ─── GERENCIAMENTO DE INSTÂNCIA ───────────────────────────────────────────────

export async function createInstance({ evolutionUrl, evolutionKey, clientId, webhookUrl }) {
  const name = instanceName(clientId);

  const body = {
    instanceName: name,
    integration: 'WHATSAPP-BAILEYS',
    webhook: {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    },
    qrcode: true,
    rejectCall: true,
    msgCall: 'Não realizamos atendimento por chamada. Por favor, envie uma mensagem!',
    groupsIgnore: true,
    alwaysOnline: true,
    readMessages: true,
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

export async function getQrCode({ evolutionUrl, evolutionKey, clientId }) {
  const name = instanceName(clientId);

  const res  = await fetch(`${evolutionUrl}/instance/connect/${name}`, {
    headers: evolutionHeaders(evolutionKey),
  });

  const data = await res.json();

  if (!res.ok) throw new Error(`Falha ao buscar QR: ${JSON.stringify(data)}`);

  return {
    qrcode: data.code,
    pairingCode: data.code,
  };
}

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

export async function checkWarmupLimit(client) {
  if (!client.warmup_enabled) return { canSend: true };

  const WARMUP_SCHEDULE = [20, 40, 60, 80, 100, 150, 200];
  const warmupDay = client.warmup_day || 0;

  if (warmupDay >= WARMUP_SCHEDULE.length) {
    return { canSend: true, warmupComplete: true };
  }

  const dailyLimit = WARMUP_SCHEDULE[warmupDay];
  const maxMsgs    = client.warmup_max_msgs || dailyLimit;

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
    return { canSend: false, sentToday, dailyLimit: maxMsgs, warmupDay };
  }

  return { canSend: true, sentToday, dailyLimit: maxMsgs, warmupDay };
}

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
