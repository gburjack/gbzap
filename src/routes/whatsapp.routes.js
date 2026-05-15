// src/routes/whatsapp.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { getStatus, connectInstance, disconnectInstance } from '../controllers/whatsapp.controller.js';

const router = Router();
router.use(authMiddleware);

router.get('/status',      getStatus);
router.post('/connect',    connectInstance);
router.post('/disconnect', disconnectInstance);

export default router;
