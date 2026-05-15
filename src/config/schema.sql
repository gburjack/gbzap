-- ============================================================
-- GBZAP — SCHEMA COMPLETO DO BANCO DE DADOS
-- Execute este arquivo no SQL Editor do Supabase
-- Ordem importa: tabelas pai antes das filhas (FKs)
-- ============================================================

-- Habilitar extensão para UUID automático
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: clients
-- Cada linha = um cliente da plataforma GbZap
-- ============================================================
CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),

  -- Configurações do agente (base de conhecimento)
  agent_name          TEXT DEFAULT 'Assistente',
  business_name       TEXT,
  business_description TEXT,
  products_services   TEXT,
  location            TEXT,
  working_hours_text  TEXT,
  payment_methods     TEXT,
  differentials       TEXT,
  faq                 TEXT,
  agent_tone          TEXT DEFAULT 'friendly' CHECK (agent_tone IN ('formal', 'friendly', 'fun', 'professional')),
  agent_goal          TEXT DEFAULT 'general' CHECK (agent_goal IN ('sales', 'scheduling', 'support', 'general')),
  agent_instructions  TEXT,
  agent_restrictions  TEXT,

  -- Chaves de API (criptografadas em produção)
  groq_api_key        TEXT,
  gemini_api_key      TEXT,
  evolution_api_url   TEXT,
  evolution_api_key   TEXT,
  calendly_api_key    TEXT,
  calendly_event_url  TEXT,

  -- Modo de operação
  operation_mode  TEXT NOT NULL DEFAULT 'ai_24h' CHECK (operation_mode IN ('ai_24h', 'hybrid', 'manual')),
  transition_mode TEXT NOT NULL DEFAULT 'visible' CHECK (transition_mode IN ('visible', 'invisible')),
  transition_message TEXT DEFAULT 'Nosso atendimento humano encerrou. Sou a assistente virtual e continuarei te ajudando!',

  -- Controle de override manual da IA
  ai_override_enabled BOOLEAN DEFAULT NULL, -- NULL = segue horário, TRUE = forçado ligado, FALSE = forçado desligado

  -- Follow-up automático
  followup_enabled  BOOLEAN DEFAULT true,
  followup_delay_h  INTEGER DEFAULT 2,   -- horas até o 1º follow-up
  followup_delay2_h INTEGER DEFAULT 24,  -- horas até o 2º follow-up
  followup_max_attempts INTEGER DEFAULT 2,
  followup_message  TEXT DEFAULT 'Oi! Vi que ficamos sem resposta. Posso te ajudar com mais alguma coisa?',

  -- Aquecimento do número
  warmup_enabled     BOOLEAN DEFAULT true,
  warmup_day         INTEGER DEFAULT 0,  -- quantos dias de aquecimento já passou
  warmup_max_msgs    INTEGER DEFAULT 30, -- limite do dia de hoje

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: client_schedules
-- Horários de operação por dia da semana por cliente
-- ============================================================
CREATE TABLE client_schedules (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Dom, 1=Seg ... 6=Sáb
  is_active  BOOLEAN DEFAULT true,
  mode       TEXT NOT NULL DEFAULT 'hybrid' CHECK (mode IN ('ai_24h', 'hybrid', 'manual', 'closed')),
  human_start TIME,  -- ex: '08:00'
  human_end   TIME,  -- ex: '18:00'
  UNIQUE (client_id, day_of_week)
);

-- ============================================================
-- TABELA: client_holidays
-- Feriados cadastrados manualmente por cliente
-- ============================================================
CREATE TABLE client_holidays (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  name       TEXT NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'ai_24h' CHECK (mode IN ('ai_24h', 'closed', 'normal')),
  UNIQUE (client_id, date)
);

-- ============================================================
-- TABELA: contacts
-- Cada número de WhatsApp que já interagiu com um cliente
-- ============================================================
CREATE TABLE contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone         TEXT NOT NULL,           -- ex: '5511999999999'
  name          TEXT,                    -- nome salvo no WhatsApp
  email         TEXT,
  notes         TEXT,                    -- anotações do atendente
  funnel_stage  TEXT DEFAULT 'new' CHECK (funnel_stage IN ('new', 'interest', 'negotiation', 'closed', 'post_sale')),
  preferences   JSONB DEFAULT '{}',      -- preferências detectadas pela IA
  ai_controlled BOOLEAN DEFAULT true,    -- false = humano assumiu essa conversa
  last_seen_at  TIMESTAMPTZ,
  followup_count INTEGER DEFAULT 0,      -- quantos follow-ups já foram enviados
  followup_sent_at TIMESTAMPTZ,          -- quando foi o último follow-up
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, phone)
);

-- ============================================================
-- TABELA: conversations
-- Cada sessão de conversa (pode ter múltiplas por contato)
-- ============================================================
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'instagram', 'telegram')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_human', 'human_active', 'closed')),
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: messages
-- Cada mensagem de cada conversa
-- ============================================================
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender          TEXT NOT NULL CHECK (sender IN ('contact', 'ai', 'human')),
  content         TEXT,                  -- texto da mensagem (ou transcrição do áudio)
  media_type      TEXT CHECK (media_type IN ('text', 'audio', 'image', 'video', 'document', 'location', 'sticker', 'other')),
  media_url       TEXT,                  -- URL da mídia original
  media_processed TEXT,                  -- texto extraído/transcrição
  evolution_id    TEXT,                  -- ID da mensagem na Evolution API
  ai_model_used   TEXT,                  -- qual modelo respondeu (groq/gemini)
  ai_prompt_tokens INTEGER,
  ai_completion_tokens INTEGER,
  error           TEXT,                  -- se houve erro ao processar
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: appointments
-- Agendamentos criados via Calendly
-- ============================================================
CREATE TABLE appointments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  calendly_event_id TEXT,               -- ID único do evento no Calendly
  calendly_event_url TEXT,
  title           TEXT,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,
  location        TEXT,
  meeting_link    TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'rescheduled', 'completed')),
  reminder_24h_sent BOOLEAN DEFAULT false,
  reminder_1h_sent  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: ai_gaps
-- Mensagens que a IA não soube responder (para melhorar a base)
-- ============================================================
CREATE TABLE ai_gaps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id),
  message_content TEXT NOT NULL,
  ai_response     TEXT,
  resolved        BOOLEAN DEFAULT false,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: activity_logs
-- Log de ações importantes do sistema
-- ============================================================
CREATE TABLE activity_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,    -- ex: 'message_received', 'ai_fallback', 'human_takeover'
  payload    JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES — para queries rápidas nas rotas mais usadas
-- ============================================================

-- Mensagens por conversa (ordem cronológica)
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- Conversas abertas por cliente
CREATE INDEX idx_conversations_client_status ON conversations(client_id, status);

-- Contatos por cliente
CREATE INDEX idx_contacts_client ON contacts(client_id);

-- Contatos sem resposta (follow-up)
CREATE INDEX idx_contacts_followup ON contacts(client_id, last_seen_at, ai_controlled);

-- Agendamentos futuros por cliente
CREATE INDEX idx_appointments_future ON appointments(client_id, start_time) WHERE status = 'scheduled';

-- Logs por cliente e tipo
CREATE INDEX idx_logs_client_event ON activity_logs(client_id, event_type, created_at);

-- ============================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger nas tabelas que têm updated_at
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — isolamento de dados por cliente
-- Ativa o RLS mas deixa o service_key do backend passar por tudo
-- ============================================================
ALTER TABLE clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gaps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_holidays  ENABLE ROW LEVEL SECURITY;

-- O backend usa a service_key, que bypassa o RLS automaticamente.
-- As políticas abaixo são para acesso direto via Supabase SDK no frontend (futuro).
-- Por ora, todo acesso passa pelo backend com service_key.

-- ============================================================
-- DADOS INICIAIS — horários padrão para novos clientes
-- (inseridos pelo backend ao criar cada cliente)
-- ============================================================
-- INSERT INTO client_schedules (client_id, day_of_week, mode, human_start, human_end)
-- Executado pelo backend no controller de criação de cliente

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
