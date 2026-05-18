// src/controllers/whatsapp.controller.js
import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import fetch from 'node-fetch';

function instanceName(clientId) {
  return `gbzap_${clientId.replace(/-/g, '').substring(0, 16)}`;
}

// GET /api/whatsapp/status
export async function getStatus(req, res) {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('evolution_api_url, evolution_api_key')
      .eq('id', req.client.id)
      .single();

    if (!client?.evolution_api_url || !client?.evolution_api_key) {
      return res.json({ configured: false, connected: false });
    }

    const name = instanceName(req.client.id);
    const r = await fetch(
      `${client.evolution_api_url}/instance/connectionState/${name}`,
      { headers: { apikey: client.evolution_api_key } }
    );
    const data = await r.json();
    return res.json({
      configured: true,
      connected: data?.instance?.state === 'open',
      state: data?.instance?.state || 'unknown',
    });
  } catch (err) {
    return res.json({ configured: true, connected: false, state: 'error' });
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

    if (!client?.evolution_api_url || !client?.evolution_api_key) {
      return res.status(400).json({ error: 'Configure a Evolution API primeiro' });
    }

    const name = instanceName(client.id);
    const webhookUrl = `${process.env.BACKEND_URL}/webhook/evolution/${client.id}`;

    // Tenta criar a instância
    try {
      await fetch(`${client.evolution_api_url}/instance/create`, {
        method: 'POST',
        headers: { apikey: client.evolution_api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: name,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          webhook: {
            url: webhookUrl,
            byEvents: true,
            base64: true,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
          },
          groupsIgnore: true,
          rejectCall: true,
          alwaysOnline: true,
          readMessages: true,
        }),
      });
    } catch (_) {}

    // Busca o QR Code — tenta até 3 vezes
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 2000));
      
      const qrRes = await fetch(
        `${client.evolution_api_url}/instance/connect/${name}`,
        { headers: { apikey: client.evolution_api_key } }
      );
      const qrData = await qrRes.json();

      logger.info(`QR attempt ${i + 1}: ${JSON.stringify(qrData)}`);

      // Evolution v2 retorna code ou base64
      const qrcode = qrData?.code || qrData?.base64 || qrData?.qrcode?.base64;

      if (qrcode) {
        return res.json({ message: 'Escaneie o QR Code', qrcode, webhookUrl });
      }
    }

    return res.status(500).json({ error: 'QR Code não disponível. Tente novamente em alguns segundos.' });
  } catch (err) {
    logger.error('Erro ao conectar instância:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/whatsapp/disconnect
export async function disconnectInstance(req, res) {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('id, evolution_api_url, evolution_api_key')
      .eq('id', req.client.id)
      .single();

    const name = instanceName(client.id);
    await fetch(`${client.evolution_api_url}/instance/delete/${name}`, {
      method: 'DELETE',
      headers: { apikey: client.evolution_api_key },
    });

    return res.json({ message: 'Desconectado. Histórico preservado.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao desconectar' });
  }
}
