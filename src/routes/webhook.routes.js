// src/routes/webhook.routes.js
import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { processIncomingMessage } from '../services/whatsapp/message.processor.js';
import { processCalendlyWebhook } from '../services/calendly/calendly.service.js';

const router = Router();

// Função para extrair e decodificar o payload da Evolution API
// A Evolution envia com webhook_base64:true, então o body pode vir encodado
function parseEvolutionPayload(req) {
  try {
    // Caso 1: body já foi parseado pelo express.json() como objeto
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      // Verifica se tem campo 'data' como string base64
      if (typeof req.body.data === 'string') {
        try {
          const decoded = Buffer.from(req.body.data, 'base64').toString('utf8');
          const innerData = JSON.parse(decoded);
          return { ...req.body, data: innerData };
        } catch {
          // data não é base64, usa como está
          return req.body;
        }
      }
      return req.body;
    }

    // Caso 2: body é Buffer ou string (raw)
    const raw = req.body?.toString?.() || '';

    // Tenta JSON direto
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.data === 'string') {
        try {
          const decoded = Buffer.from(parsed.data, 'base64').toString('utf8');
          parsed.data = JSON.parse(decoded);
        } catch { /* data não é base64 */ }
      }
      return parsed;
    } catch { /* não é JSON direto */ }

    // Tenta base64 puro (body inteiro encodado)
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch { /* não é base64 puro */ }

    return null;
  } catch (err) {
    logger.error('parseEvolutionPayload erro:', err.message);
    return null;
  }
}

// Evolution API: POST /webhook/evolution/:clientId
router.post('/evolution/:clientId', async (req, res) => {
  // Responde imediatamente (Evolution tem timeout de 5s)
  res.status(200).json({ received: true });

  const { clientId } = req.params;

  const payload = parseEvolutionPayload(req);

  if (!payload) {
    logger.warn(`[Webhook] Payload inválido ou não parseável (cliente: ${clientId})`);
    logger.warn(`[Webhook] Body raw: ${JSON.stringify(req.body)?.substring(0, 200)}`);
    return;
  }

  logger.info(`[Webhook] Evento recebido: ${payload.event} | Cliente: ${clientId}`);

  // Só processa mensagens novas recebidas
  const relevantEvents = ['messages.upsert', 'MESSAGES_UPSERT'];
  if (!relevantEvents.includes(payload.event)) {
    logger.info(`[Webhook] Evento ignorado: ${payload.event}`);
    return;
  }

  // Ignora grupos
  const remoteJid = payload.data?.key?.remoteJid || '';
  if (remoteJid.endsWith('@g.us')) {
    logger.info(`[Webhook] Mensagem de grupo ignorada: ${remoteJid}`);
    return;
  }

  logger.info(`[Webhook] Processando mensagem de: ${remoteJid}`);

  // Processa de forma assíncrona
  processIncomingMessage(clientId, payload).catch(err => {
    logger.error(`[Webhook] Erro ao processar mensagem (${clientId}): ${err.message}`);
    logger.error(err.stack);
  });
});

// Calendly: POST /webhook/calendly/:clientId
router.post('/calendly/:clientId', async (req, res) => {
  res.status(200).json({ received: true });

  const { clientId } = req.params;
  let payload;

  try {
    payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(req.body.toString());
  } catch {
    logger.warn(`[Webhook] Calendly body inválido (cliente: ${clientId})`);
    return;
  }

  processCalendlyWebhook(clientId, payload).catch(err => {
    logger.error(`[Webhook] Erro Calendly (${clientId}): ${err.message}`);
  });
});

export default router;
