// src/routes/conversation.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { supabase } from '../config/database.js';

const router = Router();
router.use(authMiddleware);

// Listar conversas
router.get('/', async (req, res) => {
  const { status } = req.query;
  let query = supabase
    .from('conversations')
    .select('*, contacts(name, phone, funnel_stage)')
    .eq('client_id', req.client.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ conversations: data });
});

// Buscar mensagens de uma conversa
router.get('/:id/messages', async (req, res) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', req.params.id)
    .eq('client_id', req.client.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ messages: data });
});

export default router;
