// src/controllers/auth.controller.js
// Login e registro de clientes na plataforma GbZap

import bcrypt from 'bcryptjs';
import { supabase } from '../config/database.js';
import { generateToken } from '../middlewares/auth.middleware.js';
import { logger } from '../utils/logger.js';

// Horários padrão inseridos ao criar um novo cliente
const DEFAULT_SCHEDULES = [
  { day_of_week: 0, mode: 'ai_24h', is_active: true },              // Dom
  { day_of_week: 1, mode: 'hybrid', human_start: '08:00', human_end: '18:00', is_active: true }, // Seg
  { day_of_week: 2, mode: 'hybrid', human_start: '08:00', human_end: '18:00', is_active: true }, // Ter
  { day_of_week: 3, mode: 'hybrid', human_start: '08:00', human_end: '18:00', is_active: true }, // Qua
  { day_of_week: 4, mode: 'hybrid', human_start: '08:00', human_end: '18:00', is_active: true }, // Qui
  { day_of_week: 5, mode: 'hybrid', human_start: '08:00', human_end: '18:00', is_active: true }, // Sex
  { day_of_week: 6, mode: 'hybrid', human_start: '08:00', human_end: '12:00', is_active: true }, // Sáb
];

// POST /api/auth/register
export async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres' });
    }

    // Verificar se email já existe
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    // Criar o cliente
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        name,
        email: email.toLowerCase(),
        password_hash,
        agent_name: 'Assistente',
        status: 'trial',
      })
      .select('id, name, email, status, plan')
      .single();

    if (error) throw error;

    // Inserir horários padrão
    const schedules = DEFAULT_SCHEDULES.map(s => ({ ...s, client_id: client.id }));
    await supabase.from('client_schedules').insert(schedules);

    const token = generateToken({ clientId: client.id });

    logger.info(`Novo cliente registrado: ${email}`);

    return res.status(201).json({
      message: 'Conta criada com sucesso',
      token,
      client: { id: client.id, name: client.name, email: client.email, status: client.status, plan: client.plan },
    });
  } catch (err) {
    logger.error('Erro ao registrar cliente:', err.message);
    return res.status(500).json({ error: 'Erro ao criar conta' });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Buscar cliente (inclui password_hash)
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, email, password_hash, status, plan, operation_mode')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !client) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const passwordMatch = await bcrypt.compare(password, client.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (client.status === 'suspended') {
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.' });
    }

    const token = generateToken({ clientId: client.id });

    logger.info(`Login: ${email}`);

    return res.json({
      token,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        status: client.status,
        plan: client.plan,
        operation_mode: client.operation_mode,
      },
    });
  } catch (err) {
    logger.error('Erro no login:', err.message);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
}

// POST /api/auth/admin/login — login do dono da plataforma
export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;

    if (
      email !== process.env.ADMIN_EMAIL ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = generateToken({ isAdmin: true, email }, '1d');

    return res.json({ token });
  } catch (err) {
    logger.error('Erro no login admin:', err.message);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
}

// GET /api/auth/me — retorna dados do cliente autenticado
export async function getMe(req, res) {
  // req.client já foi populado pelo authMiddleware
  return res.json({ client: req.client });
}
