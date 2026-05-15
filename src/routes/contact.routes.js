// src/routes/contact.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { supabase } from '../config/database.js';

const router = Router();
router.use(authMiddleware);

// Listar contatos com funil
router.get('/', async (req, res) => {
  const { stage, search } = req.query;
  let query = supabase.from('contacts').select('*').eq('client_id', req.client.id).order('updated_at', { ascending: false });
  if (stage) query = query.eq('funnel_stage', stage);
  if (search) query = query.ilike('name', `%${search}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ contacts: data });
});

// Atualizar estágio do funil manualmente
router.patch('/:id/funnel', async (req, res) => {
  const { funnel_stage } = req.body;
  const { data, error } = await supabase
    .from('contacts').update({ funnel_stage }).eq('id', req.params.id).eq('client_id', req.client.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ contact: data });
});

// Assumir/liberar conversa (humano)
router.patch('/:id/takeover', async (req, res) => {
  const { ai_controlled } = req.body;
  const { data, error } = await supabase
    .from('contacts').update({ ai_controlled }).eq('id', req.params.id).eq('client_id', req.client.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ contact: data });
});

export default router;
