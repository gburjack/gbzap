// src/server.js
// Ponto de entrada do backend GbZap

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { logger } from './utils/logger.js';
import { testDatabaseConnection } from './config/database.js';

// Rotas
import authRoutes        from './routes/auth.routes.js';
import clientRoutes      from './routes/client.routes.js';
import contactRoutes     from './routes/contact.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import settingsRoutes    from './routes/settings.routes.js';
import dashboardRoutes   from './routes/dashboard.routes.js';
import adminRoutes       from './routes/admin.routes.js';
import webhookRoutes     from './routes/webhook.routes.js';
import whatsappRoutes    from './routes/whatsapp.routes.js';
import appointmentRoutes from './routes/appointments.routes.js';

// Filas e agendamentos (inicializa ao subir o servidor)
import { initQueues } from './queues/index.js';
import { initCronJobs } from './queues/cron.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Trust proxy (OBRIGATÓRIO no Railway) ───────────────────
// Sem isso, o express-rate-limit rejeita headers X-Forwarded-For
app.set('trust proxy', 1);

// ─── Middlewares de segurança ────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5173',  // Vite dev
    'http://localhost:3001',
  ],
  credentials: true,
}));

// Rate limit geral: 200 req/min por IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
  // Ignora erros de proxy — não quebra se header vier inesperado
  validate: { xForwardedForHeader: false },
}));

// Rate limit específico para webhooks (mais permissivo — Evolution manda muita coisa)
const webhookLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  validate: { xForwardedForHeader: false },
});

// ─── Parse do body ───────────────────────────────────────────
// Webhooks precisam do raw body antes do JSON parser
app.use('/webhook', webhookLimit, express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'gbzap-backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ─── Rotas da API ────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/client',        clientRoutes);
app.use('/api/contacts',      contactRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/whatsapp',      whatsappRoutes);
app.use('/api/appointments',  appointmentRoutes);
app.use('/webhook',           webhookRoutes);

// ─── Handler de erros global ─────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Erro não tratado: ${err.message}`, { stack: err.stack, path: req.path });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message,
  });
});

// ─── Inicialização ───────────────────────────────────────────
async function bootstrap() {
  // 1. Testar banco de dados
  await testDatabaseConnection();

  // 2. Inicializar filas Bull
  await initQueues();

  // 3. Inicializar cron jobs
  initCronJobs();

  // 4. Subir servidor
  app.listen(PORT, () => {
    logger.info(`🚀 GbZap backend rodando na porta ${PORT}`);
    logger.info(`   Ambiente: ${process.env.NODE_ENV}`);
    logger.info(`   Frontend: ${process.env.FRONTEND_URL}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});

export default app;
