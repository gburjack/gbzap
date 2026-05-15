// src/controllers/whatsapp.controller.js
// Endpoints do painel para gerenciar a instância WhatsApp do cliente:
// - Criar/reconectar instância
// - Ver QR Code
// - Verificar status de conexão
// - Trocar número

import { supabase } from '../config/database.js';
import {
  createInstance,
  getQrCode,
  getInstanceStatus,
  deleteInstance,
} from '../services/whatsapp/evolution.service.js';
import { logger } from '../utils/logger.js';

// GET /api/whatsapp/status
export async function getStatus(req, res) {
  try {
    const client = req.client;

    if (!client.evolution_api_url || !client.evolution_api_key) {
      return res.json({
        configured: false,
        message: 'Evolution API não configurada. Adicione a URL e chave em Configurações > Integrações.',
      });
    }

    const status = await getInstanceStatus({
      evolutionUrl: client.evolution_api_url,
      evolutionKey: client.evolution_api_key,
      clientId:     client.id,
    });

    return res.json({ configured: true, ...status });
  } catch (err) {
    logger.error('Erro ao verificar status WhatsApp:', err.message);
    return res.status(500).json({ error: 'Erro ao verificar status' });
  }
}

// POST /api/whatsapp/connect
export async function connectInstance(req, res) {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('id, evolution_api_url, evolution_api_key')
      .eq('id', req.client.id)
      .single();

    if (!client.evolution_api_url || !client.evolution_api_key) {
      return res.status(400).json({ error: 'Configure a Evolution API primeiro em Configurações' });
    }

    const webhookUrl = `${process.env.BACKEND_URL}/webhook/evolution/${client.id}`;

    // Tenta criar a instância (se já existir, Evolution retorna erro que ignoramos)
    try {
      await createInstance({
        evolutionUrl: client.evolution_api_url,
        evolutionKey: client.evolution_api_key,
        clientId:     client.id,
        webhookUrl,
      });
    } catch (err) {
      // Se já existir, só busca o QR code
      if (!err.message?.includes('already exists') && !err.message?.includes('já existe')) {
        throw err;
      }
    }

    // Busca QR Code
    const { qrcode } = await getQrCode({
      evolutionUrl: client.evolution_api_url,
      evolutionKey: client.evolution_api_key,
      clientId:     client.id,
    });

    return res.json({
      message: 'Escaneie o QR Code com o WhatsApp',
      qrcode,
      webhookUrl,
    });
  } catch (err) {
    logger.error('Erro ao conectar instância:', err.message);
    return res.status(500).json({ error: `Erro ao conectar: ${err.message}` });
  }
}

// POST /api/whatsapp/disconnect
// Deleta a instância atual mas preserva o histórico no banco
export async function disconnectInstance(req, res) {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('id, evolution_api_url, evolution_api_key')
      .eq('id', req.client.id)
      .single();

    await deleteInstance({
      evolutionUrl: client.evolution_api_url,
      evolutionKey: client.evolution_api_key,
      clientId:     client.id,
    });

    return res.json({ message: 'Instância desconectada. Histórico de conversas preservado.' });
  } catch (err) {
    logger.error('Erro ao desconectar instância:', err.message);
    return res.status(500).json({ error: 'Erro ao desconectar' });
  }
}
