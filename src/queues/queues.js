// src/queues/queues.js
// Define e exporta todas as filas Bull do GbZap.
// Cada fila tem seu próprio propósito e configuração de retry.
//
// Filas criadas:
//   followUpQueue   — envia mensagens de follow-up para contatos sumidos
//   reminderQueue   — envia lembretes de agendamento (24h e 1h antes)
//   messageQueue    — fila de envio de mensagens com rate limiting por cliente
//   warmupQueue     — avança o plano de aquecimento diário dos números

import Bull from 'bull';
import { redisConnection } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// Configuração de conexão compartilhada entre todas as filas
// Bull v4 exige que createClient retorne a mesma conexão para subscriber/bclient
const bullRedisConfig = {
  createClient(type) {
    switch (type) {
      case 'client':
        return redisConnection;
      case 'subscriber':
        return redisConnection.duplicate();
      case 'bclient':
        return redisConnection.duplicate();
      default:
        return redisConnection;
    }
  },
};

// Opções padrão de retry para todas as filas
const defaultJobOptions = {
  attempts: 3,                  // tenta 3 vezes antes de marcar como falha
  backoff: {
    type: 'exponential',
    delay: 5000,                // 5s → 25s → 125s
  },
  removeOnComplete: 100,        // mantém os últimos 100 jobs concluídos
  removeOnFail: 200,            // mantém os últimos 200 jobs falhos para debug
};

// ── Follow-up Queue ────────────────────────────────────────────────────────
// Jobs: { clientId, contactId, phone, attemptNumber, message }
export const followUpQueue = new Bull('gbzap:follow-up', { redis: bullRedisConfig, defaultJobOptions });

// ── Reminder Queue ─────────────────────────────────────────────────────────
// Jobs: { clientId, appointmentId, contactId, phone, type: '24h'|'1h', appointmentData }
export const reminderQueue = new Bull('gbzap:reminders', { redis: bullRedisConfig, defaultJobOptions });

// ── Message Queue ──────────────────────────────────────────────────────────
// Jobs: { clientId, phone, text, evolutionUrl, evolutionKey }
// Usada para envios em lote (campanhas, lembretes múltiplos)
// Rate limit: 1 msg/segundo por cliente para evitar ban
export const messageQueue = new Bull('gbzap:messages', {
  redis: bullRedisConfig,
  defaultJobOptions,
  limiter: {
    max:      1,      // 1 job por vez
    duration: 1200,   // a cada 1.2 segundos (margem de segurança)
  },
});

// ── Warmup Queue ────────────────────────────────────────────────────────────
// Jobs: { clientId } — avança o dia de aquecimento
export const warmupQueue = new Bull('gbzap:warmup', { redis: bullRedisConfig, defaultJobOptions });

// ── Utilitário: log de eventos das filas ──────────────────────────────────
export function attachQueueListeners(queue) {
  queue.on('completed', (job) => {
    logger.debug(`[Queue:${queue.name}] Job ${job.id} concluído`);
  });

  queue.on('failed', (job, err) => {
    logger.error(`[Queue:${queue.name}] Job ${job.id} falhou (tentativa ${job.attemptsMade}): ${err.message}`);
  });

  queue.on('stalled', (job) => {
    logger.warn(`[Queue:${queue.name}] Job ${job.id} travado — reprocessando`);
  });

  queue.on('error', (err) => {
    logger.error(`[Queue:${queue.name}] Erro na fila: ${err.message}`);
  });
}

export const allQueues = [followUpQueue, reminderQueue, messageQueue, warmupQueue];
