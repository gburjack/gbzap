// src/controllers/appointments.controller.js
// Endpoints do painel para visualizar agendamentos e status de aquecimento

import { supabase } from '../config/database.js';
import { getWarmupStatus } from '../services/warmup/warmup.service.js';
import { buildSchedulingMessage } from '../services/calendly/calendly.service.js';
import { logger } from '../utils/logger.js';

// GET /api/appointments — lista agendamentos do cliente
export async function listAppointments(req, res) {
  try {
    const { status, from, to } = req.query;
    const clientId = req.client.id;

    let query = supabase
      .from('appointments')
      .select('*, contacts(name, phone)')
      .eq('client_id', clientId)
      .order('start_time', { ascending: true });

    if (status) query = query.eq('status', status);
    if (from)   query = query.gte('start_time', from);
    if (to)     query = query.lte('start_time', to);

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ appointments: data });
  } catch (err) {
    logger.error('Erro ao listar agendamentos:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// GET /api/appointments/warmup — status de aquecimento do número
export async function getWarmup(req, res) {
  try {
    const status = await getWarmupStatus(req.client.id);
    return res.json({ warmup: status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// GET /api/appointments/scheduling-message — preview da mensagem de agendamento
export async function getSchedulingMessage(req, res) {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('calendly_event_url, agent_name, business_name')
      .eq('id', req.client.id)
      .single();

    const message = buildSchedulingMessage(client);
    return res.json({ message });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// GET /api/appointments/ai-gaps — mensagens que a IA não soube responder
export async function getAiGaps(req, res) {
  try {
    const { data, error } = await supabase
      .from('ai_gaps')
      .select('*, contacts(name, phone)')
      .eq('client_id', req.client.id)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return res.json({ gaps: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// PATCH /api/appointments/ai-gaps/:id/resolve — marca gap como resolvido
export async function resolveAiGap(req, res) {
  try {
    const { resolution_note } = req.body;
    const { error } = await supabase
      .from('ai_gaps')
      .update({ resolved: true, resolution_note })
      .eq('id', req.params.id)
      .eq('client_id', req.client.id);

    if (error) throw error;
    return res.json({ message: 'Gap marcado como resolvido' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
