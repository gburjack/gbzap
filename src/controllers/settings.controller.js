// src/controllers/settings.controller.js
// Gerencia todas as configurações do cliente: agente, horários, feriados, integrações

import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

// GET /api/settings — retorna todas as configurações do cliente
export async function getSettings(req, res) {
  try {
    const clientId = req.client.id;

    const [clientRes, schedulesRes, holidaysRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).single(),
      supabase.from('client_schedules').select('*').eq('client_id', clientId).order('day_of_week'),
      supabase.from('client_holidays').select('*').eq('client_id', clientId).order('date'),
    ]);

    if (clientRes.error) throw clientRes.error;

    // Remove o hash da senha antes de enviar
    const { password_hash, ...clientData } = clientRes.data;

    return res.json({
      client: clientData,
      schedules: schedulesRes.data || [],
      holidays: holidaysRes.data || [],
    });
  } catch (err) {
    logger.error('Erro ao buscar configurações:', err.message);
    return res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
}

// PATCH /api/settings/agent — atualiza a base de conhecimento do agente
export async function updateAgentSettings(req, res) {
  try {
    const clientId = req.client.id;
    const allowed = [
      'agent_name', 'business_name', 'business_description',
      'products_services', 'location', 'working_hours_text',
      'payment_methods', 'differentials', 'faq',
      'agent_tone', 'agent_goal', 'agent_instructions', 'agent_restrictions',
    ];

    // Filtra apenas os campos permitidos
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }

    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', clientId)
      .select()
      .single();

    if (error) throw error;

    const { password_hash, ...clientData } = data;
    return res.json({ message: 'Configurações do agente atualizadas', client: clientData });
  } catch (err) {
    logger.error('Erro ao atualizar agente:', err.message);
    return res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
}

// PATCH /api/settings/operation — modo de operação, transição, follow-up
export async function updateOperationSettings(req, res) {
  try {
    const clientId = req.client.id;
    const allowed = [
      'operation_mode', 'transition_mode', 'transition_message',
      'followup_enabled', 'followup_delay_h', 'followup_delay2_h',
      'followup_max_attempts', 'followup_message',
      'warmup_enabled',
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', clientId)
      .select()
      .single();

    if (error) throw error;

    const { password_hash, ...clientData } = data;
    return res.json({ message: 'Configurações de operação atualizadas', client: clientData });
  } catch (err) {
    logger.error('Erro ao atualizar operação:', err.message);
    return res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
}

// PATCH /api/settings/apis — chaves de API das integrações
export async function updateApiKeys(req, res) {
  try {
    const clientId = req.client.id;
    const allowed = [
      'groq_api_key', 'gemini_api_key',
      'evolution_api_url', 'evolution_api_key',
      'calendly_api_key', 'calendly_event_url',
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const { error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', clientId);

    if (error) throw error;

    logger.info(`Chaves de API atualizadas para cliente ${clientId}`);
    return res.json({ message: 'Chaves de API atualizadas com sucesso' });
  } catch (err) {
    logger.error('Erro ao atualizar APIs:', err.message);
    return res.status(500).json({ error: 'Erro ao atualizar chaves de API' });
  }
}

// PUT /api/settings/schedules — salva horários por dia da semana
export async function updateSchedules(req, res) {
  try {
    const clientId = req.client.id;
    const { schedules } = req.body; // array de { day_of_week, mode, human_start, human_end, is_active }

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({ error: 'Envie um array de horários' });
    }

    // Upsert: atualiza se existir, insere se não
    const rows = schedules.map(s => ({
      client_id: clientId,
      day_of_week: s.day_of_week,
      mode: s.mode,
      human_start: s.human_start || null,
      human_end: s.human_end || null,
      is_active: s.is_active !== false,
    }));

    const { error } = await supabase
      .from('client_schedules')
      .upsert(rows, { onConflict: 'client_id,day_of_week' });

    if (error) throw error;

    return res.json({ message: 'Horários atualizados com sucesso' });
  } catch (err) {
    logger.error('Erro ao atualizar horários:', err.message);
    return res.status(500).json({ error: 'Erro ao atualizar horários' });
  }
}

// POST /api/settings/holidays — adiciona um feriado
export async function addHoliday(req, res) {
  try {
    const clientId = req.client.id;
    const { date, name, mode } = req.body;

    if (!date || !name) {
      return res.status(400).json({ error: 'Data e nome do feriado são obrigatórios' });
    }

    const { data, error } = await supabase
      .from('client_holidays')
      .insert({ client_id: clientId, date, name, mode: mode || 'ai_24h' })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ holiday: data });
  } catch (err) {
    logger.error('Erro ao adicionar feriado:', err.message);
    return res.status(500).json({ error: 'Erro ao adicionar feriado' });
  }
}

// DELETE /api/settings/holidays/:id — remove um feriado
export async function deleteHoliday(req, res) {
  try {
    const clientId = req.client.id;
    const { id } = req.params;

    const { error } = await supabase
      .from('client_holidays')
      .delete()
      .eq('id', id)
      .eq('client_id', clientId); // garante que só deleta do próprio cliente

    if (error) throw error;

    return res.json({ message: 'Feriado removido' });
  } catch (err) {
    logger.error('Erro ao remover feriado:', err.message);
    return res.status(500).json({ error: 'Erro ao remover feriado' });
  }
}

// PATCH /api/settings/ai-override — ativa/desativa IA manualmente
export async function setAiOverride(req, res) {
  try {
    const clientId = req.client.id;
    const { enabled } = req.body; // true = forçar IA ligada, false = forçar desligada, null = seguir horário

    const { error } = await supabase
      .from('clients')
      .update({ ai_override_enabled: enabled })
      .eq('id', clientId);

    if (error) throw error;

    const status = enabled === null ? 'automático (segue horário)' : enabled ? 'IA forçada ON' : 'IA forçada OFF';
    logger.info(`Override IA — cliente ${clientId}: ${status}`);

    return res.json({ message: `Modo de IA definido como: ${status}`, ai_override_enabled: enabled });
  } catch (err) {
    logger.error('Erro ao definir override:', err.message);
    return res.status(500).json({ error: 'Erro ao atualizar modo da IA' });
  }
}
