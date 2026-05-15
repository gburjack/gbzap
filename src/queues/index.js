// src/queues/index.js
// Inicializa todas as filas Bull e registra os workers.

import { logger } from '../utils/logger.js';
import {
  followUpQueue, reminderQueue, messageQueue, warmupQueue,
  attachQueueListeners, allQueues,
} from './queues.js';
import { processFollowUpJob } from '../services/followup/followup.service.js';
import { processReminderJob } from '../services/reminders/reminder.service.js';
import { processWarmupJob } from '../services/warmup/warmup.service.js';
import { sendTextMessage } from '../services/whatsapp/evolution.service.js';

export async function initQueues() {
  try {
    logger.info('📦 Inicializando filas Bull...');

    // Worker: Follow-up (3 em paralelo)
    followUpQueue.process(3, async (job) => {
      await processFollowUpJob(job);
    });

    // Worker: Lembretes (5 em paralelo — precisa ser pontual)
    reminderQueue.process(5, async (job) => {
      await processReminderJob(job);
    });

    // Worker: Envio de mensagens (1 = rate limited)
    messageQueue.process(1, async (job) => {
      const { clientId, phone, text, evolutionUrl, evolutionKey } = job.data;
      await sendTextMessage({ evolutionUrl, evolutionKey, clientId, phone, text });
    });

    // Worker: Aquecimento (2 em paralelo)
    warmupQueue.process(2, async (job) => {
      await processWarmupJob(job);
    });

    // Listeners de log em todas as filas
    allQueues.forEach(attachQueueListeners);

    // Exibe status ao iniciar
    const stats = await Promise.all(
      allQueues.map(async (q) => {
        const counts = await q.getJobCounts();
        return `  ${q.name}: ${counts.waiting} aguardando, ${counts.active} ativos`;
      })
    );
    stats.forEach(s => logger.info(s));
    logger.info('✅ Todas as filas inicializadas');

  } catch (err) {
    logger.warn(`Bull Queue indisponível (Redis ausente?): ${err.message}`);
    logger.warn('Follow-up e lembretes desabilitados até Redis ser configurado');
  }
}
