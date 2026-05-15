// src/config/redis.js
// Conexão com Redis (usado pelo Bull Queue para filas de tarefas)

import IORedis from 'ioredis';
import { logger } from '../utils/logger.js';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  logger.warn('REDIS_URL não definida — filas de tarefas não funcionarão');
}

// Configuração robusta para Railway/Upstash
export const redisConnection = new IORedis(redisUrl || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // obrigatório para Bull v4
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000); // backoff exponencial até 5s
    logger.warn(`Redis reconectando em ${delay}ms (tentativa ${times})`);
    return delay;
  },
});

redisConnection.on('connect', () => logger.info('✅ Redis conectado'));
redisConnection.on('error', (err) => logger.error('❌ Erro Redis:', err.message));
