// src/routes/webhook.routes.js
// Recebe e processa todos os webhooks externos:
// - Evolution API (mensagens WhatsApp)
// - Calendly (confirmações de agendamento)

import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { processIncomingMessage } from '../services/whatsapp/message.processor.js';
import { processCalendlyWebhook } from '../services/calendly/calendly.service.js';

const router = Router();

// Evolution API: POST /webhook/evolution/:clientId
router.post('/evolution/:clientId', async (req, res) => {
  // Responde imediatamente (Evolution tem timeout de 5s)
  res.status(200).json({ received: true });

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    logger.warn(`Webhook Evolution body inválido (cliente: ${req.params.clientId})`);
    return;
  }

  const { clientId } = req.params;

  // Só processa mensagens novas recebidas
  const relevantEvents = ['messages.upsert', 'MESSAGES_UPSERT'];
  if (!relevantEvents.includes(payload.event)) return;

  // Ignora grupos
  const remoteJid = payload.data?.key?.remoteJid || '';
  if (remoteJid.endsWith('@g.us')) return;

  // Processa de forma assíncrona
  processIncomingMessage(clientId, payload).catch(err => {
    logger.error(`Erro webhook Evolution (${clientId}):`, err.message);
  });
});

// Calendly: POST /webhook/calendly/:clientId
router.post('/calendly/:clientId', async (req, res) => {
  res.status(200).json({ received: true });

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    logger.warn(`Webhook Calendly body inválido (cliente: ${req.params.clientId})`);
    return;
  }

  processCalendlyWebhook(req.params.clientId, payload).catch(err => {
    logger.error(`Erro webhook Calendly (${req.params.clientId}):`, err.message);
  });
});

export default router;
