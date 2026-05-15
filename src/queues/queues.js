// src/queues/queues.js
import Bull from 'bull';
import { logger } from '../utils/logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Upstash com TLS: converte rediss:// para opções separadas
function getRedisOpts(url) {
  if (!url || !url.startsWith('rediss://')) {
    return { redis: url };
  }

  const parsed = new URL(url);
  return {
    redis: {
      host:     parsed.hostname,
      port:     parseInt(parsed.port) || 6379,
      password: parsed.password,
      username: parsed.username || 'default',
      tls:      { rejectUnauthorized: false },
    },
  };
}

const redisOpts = getRedisOpts(redisUrl);

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

export const followUpQueue = new Bull('gbzap:follow-up', { ...redisOpts, defaultJobOptions });
export const reminderQueue = new Bull('gbzap:reminders', { ...redisOpts, defaultJobOptions });
export const messageQueue  = new Bull('gbzap:messages',  { ...redisOpts, defaultJobOptions, limiter: { max: 1, duration: 1200 } });
export const warmupQueue   = new Bull('gbzap:warmup',    { ...redisOpts, defaultJobOptions });

export function attachQueueListeners(queue) {
  queue.on('completed', (job) => {
    logger.debug(`[Queue:${queue.name}] Job ${job.id} concluído`);
  });
  queue.on('failed', (job, err) => {
    logger.error(`[Queue:${queue.name}] Job ${job.id} falhou: ${err.message}`);
  });
  queue.on('stalled', (job) => {
    logger.warn(`[Queue:${queue.name}] Job ${job.id} travado`);
  });
  queue.on('error', (err) => {
    logger.error(`[Queue:${queue.name}] Erro na fila: ${err.message}`);
  });
}

export const allQueues = [followUpQueue, reminderQueue, messageQueue, warmupQueue];
