// src/services/warmup/warmup.service.js
// Avança o plano de aquecimento de todos os números ativos diariamente.
//
// Plano de aquecimento progressivo:
//   Dia 0: 20 msgs/dia   (número novo, muito conservador)
//   Dia 1: 40 msgs/dia
//   Dia 2: 60 msgs/dia
//   Dia 3: 80 msgs/dia
//   Dia 4: 100 msgs/dia
//   Dia 5: 150 msgs/dia
//   Dia 6: 200 msgs/dia
//   Dia 7+: sem limite (aquecimento completo)

import { supabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { warmupQueue } from '../../queues/queues.js';

const WARMUP_SCHEDULE = [20, 40, 60, 80, 100, 150, 200];

// ─── AGENDADOR (chamado pelo cron às meia-noite) ──────────────────────────────

/**
 * Enfileira o avanço de aquecimento para todos os clientes ativos.
 */
export async function scheduleWarmupAdvance() {
  logger.info('[Warmup] Enfileirando avanço diário de aquecimento...');

  try {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, warmup_enabled, warmup_day')
      .eq('status', 'active')
      .eq('warmup_enabled', true)
      .lt('warmup_day', WARMUP_SCHEDULE.length); // só os que ainda estão em aquecimento

    if (!clients?.length) {
      logger.info('[Warmup] Nenhum cliente em aquecimento');
      return;
    }

    for (const client of clients) {
      await warmupQueue.add(
        { clientId: client.id, currentDay: client.warmup_day },
        { jobId: `warmup:${client.id}:${new Date().toISOString().slice(0, 10)}` } // 1 por dia
      );
    }

    logger.info(`[Warmup] ${clients.length} cliente(s) enfileirados para avanço`);
  } catch (err) {
    logger.error('[Warmup] Erro ao agendar avanço:', err.message);
  }
}

// ─── WORKER ───────────────────────────────────────────────────────────────────

/**
 * Processa um job de avanço de aquecimento.
 */
export async function processWarmupJob(job) {
  const { clientId, currentDay } = job.data;

  try {
    const nextDay   = currentDay + 1;
    const nextLimit = WARMUP_SCHEDULE[nextDay] ?? 9999; // 9999 = sem limite

    await supabase
      .from('clients')
      .update({
        warmup_day:      nextDay,
        warmup_max_msgs: nextLimit,
      })
      .eq('id', clientId);

    if (nextDay >= WARMUP_SCHEDULE.length) {
      logger.info(`[Warmup] ✅ Cliente ${clientId} completou o aquecimento! Sem limite de mensagens.`);
    } else {
      logger.info(`[Warmup] ✅ Cliente ${clientId}: dia ${nextDay}, novo limite ${nextLimit} msgs/dia`);
    }
  } catch (err) {
    logger.error(`[Warmup] Falha ao avançar cliente ${clientId}:`, err.message);
    throw err;
  }
}

// ─── STATUS DE AQUECIMENTO ────────────────────────────────────────────────────

/**
 * Retorna o status de aquecimento de um cliente para exibição no painel.
 */
export async function getWarmupStatus(clientId) {
  const { data: client } = await supabase
    .from('clients')
    .select('warmup_enabled, warmup_day, warmup_max_msgs')
    .eq('id', clientId)
    .single();

  if (!client) return null;

  const day     = client.warmup_day || 0;
  const complete = day >= WARMUP_SCHEDULE.length;

  return {
    enabled:      client.warmup_enabled,
    complete,
    currentDay:   day,
    totalDays:    WARMUP_SCHEDULE.length,
    dailyLimit:   complete ? null : (client.warmup_max_msgs || WARMUP_SCHEDULE[day]),
    schedule:     WARMUP_SCHEDULE,
    progressPct:  Math.min(100, Math.round((day / WARMUP_SCHEDULE.length) * 100)),
  };
}
