// src/routes/auth.routes.js
import { Router } from 'express';
import { register, login, adminLogin, getMe } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register',     register);
router.post('/login',        login);
router.post('/admin/login',  adminLogin);
router.get('/me',            authMiddleware, getMe);

export default router;
