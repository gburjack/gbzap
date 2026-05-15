// src/routes/dashboard.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { supabase } from '../config/database.js';
import dayjs from 'dayjs';

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard — métricas gerais
router.get('/', async (req, res) => {
  const clientId = req.client.id;
  const today    = dayjs().startOf('day').toISOString();
  const week     = dayjs().subtract(7, 'day').toISOString();
  const month    = dayjs().startOf('month').toISOString();

  try {
    const [convTotal, convToday, convWeek, funnelCounts, gapsCount, appointments] = await Promise.all([
      supabase.from('conversations').select('id', { count: 'exact' }).eq('client_id', clientId),
      supabase.from('conversations').select('id', { count: 'exact' }).eq('client_id', clientId).gte('created_at', today),
      supabase.from('conversations').select('id', { count: 'exact' }).eq('client_id', clientId).gte('created_at', week),
      supabase.from('contacts').select('funnel_stage').eq('client_id', clientId),
      supabase.from('ai_gaps').select('id', { count: 'exact' }).eq('client_id', clientId).eq('resolved', false),
      supabase.from('appointments').select('id', { count: 'exact' }).eq('client_id', clientId).gte('created_at', month),
    ]);

    // Agrupa contatos por estágio
    const byFunnel = {};
    (funnelCounts.data || []).forEach(c => {
      byFunnel[c.funnel_stage] = (byFunnel[c.funnel_stage] || 0) + 1;
    });

    return res.json({
      conversations: {
        total: convTotal.count || 0,
        today: convToday.count || 0,
        week:  convWeek.count  || 0,
      },
      funnel: byFunnel,
      ai_gaps:      gapsCount.count || 0,
      appointments_month: appointments.count || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
