// src/queues/cron.js
// Cron jobs do GbZap — tarefas periódicas automáticas.

import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { checkAndScheduleFollowUps } from '../services/followup/followup.service.js';
import { checkAndScheduleReminders } from '../services/reminders/reminder.service.js';
import { scheduleWarmupAdvance } from '../services/warmup/warmup.service.js';
import { supabase } from '../config/database.js';

export function initCronJobs() {
  logger.info('⏰ Inicializando cron jobs...');

  // A cada 30 minutos: verifica follow-ups pendentes
  cron.schedule('*/30 * * * *', async () => {
    try { await checkAndScheduleFollowUps(); }
    catch (err) { logger.error('[CRON] follow-up:', err.message); }
  });

  // A cada hora: verifica lembretes de agendamento
  cron.schedule('0 * * * *', async () => {
    try { await checkAndScheduleReminders(); }
    catch (err) { logger.error('[CRON] lembretes:', err.message); }
  });

  // Meia-noite: avança aquecimento + arquiva conversas antigas
  cron.schedule('0 0 * * *', async () => {
    try {
      await scheduleWarmupAdvance();
      await archiveStaleConversations();
    } catch (err) { logger.error('[CRON] meia-noite:', err.message); }
  });

  // Executa verificações iniciais 15s após o boot
  setTimeout(async () => {
    try {
      await checkAndScheduleReminders();
      await checkAndScheduleFollowUps();
    } catch (err) { logger.warn('[CRON] boot inicial:', err.message); }
  }, 15_000);

  logger.info('✅ Cron jobs: */30min follow-up | */1h lembretes | 00:00 aquecimento');
}

async function archiveStaleConversations() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: stale } = await supabase
    .from('conversations')
    .select('id')
    .in('status', ['open', 'waiting_human'])
    .lt('created_at', cutoff);

  if (!stale?.length) return;

  const toClose = [];
  for (const conv of stale) {
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastMsg || lastMsg.created_at < cutoff) toClose.push(conv.id);
  }

  if (!toClose.length) return;

  await supabase
    .from('conversations')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .in('id', toClose);

  logger.info(`[CRON] ${toClose.length} conversas arquivadas por inatividade`);
}
