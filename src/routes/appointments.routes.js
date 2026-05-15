// src/routes/appointments.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import {
  listAppointments, getWarmup,
  getSchedulingMessage, getAiGaps, resolveAiGap,
} from '../controllers/appointments.controller.js';

const router = Router();
router.use(authMiddleware);

router.get('/',                    listAppointments);
router.get('/warmup',              getWarmup);
router.get('/scheduling-message',  getSchedulingMessage);
router.get('/ai-gaps',             getAiGaps);
router.patch('/ai-gaps/:id/resolve', resolveAiGap);

export default router;
