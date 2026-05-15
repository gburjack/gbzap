// src/routes/settings.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import {
  getSettings, updateAgentSettings, updateOperationSettings,
  updateApiKeys, updateSchedules, addHoliday, deleteHoliday, setAiOverride,
} from '../controllers/settings.controller.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authMiddleware);

router.get('/',                    getSettings);
router.patch('/agent',             updateAgentSettings);
router.patch('/operation',         updateOperationSettings);
router.patch('/apis',              updateApiKeys);
router.put('/schedules',           updateSchedules);
router.post('/holidays',           addHoliday);
router.delete('/holidays/:id',     deleteHoliday);
router.patch('/ai-override',       setAiOverride);

export default router;
