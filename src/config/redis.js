// src/config/redis.js
import { logger } from '../utils/logger.js';

const redisUrl = process.env.REDIS_URL;

export const redisConnection = {
  url: redisUrl || 'redis://localhost:6379',
};

if (redisUrl) {
  logger.info('✅ Redis configurado via REDIS_URL');
} else {
  logger.warn('REDIS_URL não definida — usando localhost');
}
