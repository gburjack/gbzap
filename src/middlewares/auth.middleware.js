// src/middlewares/auth.middleware.js
// Verifica o token JWT em todas as rotas protegidas

import jwt from 'jsonwebtoken';
import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

// Middleware padrão — verifica token de cliente
export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Busca o cliente no banco para garantir que ainda existe e está ativo
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, email, status, plan, operation_mode, ai_override_enabled')
      .eq('id', decoded.clientId)
      .single();

    if (error || !client) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    if (client.status === 'suspended') {
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.' });
    }

    // Anexa os dados do cliente à requisição
    req.client = client;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' });
    }
    logger.error('Erro no middleware de auth:', err.message);
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Middleware admin — verifica se é o dono da plataforma
export function adminMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Utilitário para gerar tokens
export function generateToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}
