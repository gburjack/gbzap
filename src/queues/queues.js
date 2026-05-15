// src/queues/queues.js
import Bull from 'bull';
import { logger } from '../utils/logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Upstash exige TLS — configuração necessária para rediss://
const bullRedisOpts = {
  redis: redisUrl,
  tls: redisUrl.startsWith('rediss://') ? {
    rejectUnauthorized: false,
  } : undefined,
};

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 200,
};

export const followUpQueue = new Bull('gbzap:follow-up', bullRedisOpts, { defaultJobOptions });
export const reminderQueue = new Bull('gbzap:reminders', bullRedisOpts, { defaultJobOptions });
export const messageQueue  = new Bull('gbzap:messages',  { ...bullRedisOpts, limiter: { max: 1, duration: 1200 }, defaultJobOptions });
export const warmupQueue   = new Bull('gbzap:warmup',    bullRedisOpts, { defaultJobOptions });

export function attachQueueListeners(queue) {
  queue.on('completed', (job) => {
    logger.debug(`[Queue:${queue.name}] Job ${job.id} concluído`);
  });
  queue.on('failed', (job, err) => {
    logger.error(`[Queue:${queue.name}] Job ${job.id} falhou (tentativa ${job.attemptsMade}): ${err.message}`);
  });
  queue.on('stalled', (job) => {
    logger.warn(`[Queue:${queue.name}] Job ${job.id} travado`);
  });
  queue.on('error', (err) => {
    logger.error(`[Queue:${queue.name}] Erro na fila: ${err.message}`);
  });
}

export const allQueues = [followUpQueue, reminderQueue, messageQueue, warmupQueue];
