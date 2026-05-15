// src/routes/client.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { supabase } from '../config/database.js';

const router = Router();
router.use(authMiddleware);

// Atualizar dados básicos do perfil
router.patch('/profile', async (req, res) => {
  const { name } = req.body;
  const { data, error } = await supabase
    .from('clients').update({ name }).eq('id', req.client.id).select('id,name,email').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ client: data });
});

export default router;
