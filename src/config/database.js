// src/config/database.js
// Conexão com o Supabase usando a service_key (acesso total, bypassa RLS)

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias');
  process.exit(1);
}

// Cliente único reutilizado em todo o backend
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Teste de conexão na inicialização
export async function testDatabaseConnection() {
  try {
    const { error } = await supabase.from('clients').select('id').limit(1);
    if (error) throw error;
    logger.info('✅ Conexão com Supabase estabelecida');
  } catch (err) {
    logger.error('❌ Falha ao conectar ao Supabase:', err.message);
    process.exit(1);
  }
}
