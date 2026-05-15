// src/routes/admin.routes.js
import { Router } from 'express';
import { adminMiddleware } from '../middlewares/auth.middleware.js';
import { supabase } from '../config/database.js';

const router = Router();
router.use(adminMiddleware);

// Listar todos os clientes da plataforma
router.get('/clients', async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, plan, status, created_at, operation_mode')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ clients: data });
});

// Suspender/ativar cliente
router.patch('/clients/:id/status', async (req, res) => {
  const { status } = req.body;
  const { data, error } = await supabase
    .from('clients').update({ status }).eq('id', req.params.id).select('id,name,status').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ client: data });
});

export default router;
