# GbZap — Plataforma SaaS de Agentes IA no WhatsApp

## Estrutura do projeto

```
gbzap/
├── backend/          # Node.js + Express (Railway)
│   ├── src/
│   │   ├── config/         # Banco de dados, Redis, schema SQL
│   │   ├── controllers/    # Lógica das rotas
│   │   ├── middlewares/    # Auth JWT, validações
│   │   ├── routes/         # Definição das rotas da API
│   │   ├── services/
│   │   │   ├── ai/         # Groq + Gemini (Fase 3)
│   │   │   ├── whatsapp/   # Evolution API (Fase 3)
│   │   │   ├── calendly/   # Integração Calendly (Fase 4)
│   │   │   └── media/      # Áudio, imagem, PDF (Fase 3)
│   │   ├── queues/         # Bull Queue + cron (Fase 4)
│   │   ├── utils/          # Logger, prompt builder, horários
│   │   └── webhooks/       # Processadores de webhook (Fase 3)
│   ├── .env.example
│   └── package.json
│
└── frontend/         # React + Tailwind (GitHub Pages)
    └── src/
        ├── components/
        ├── pages/
        ├── hooks/
        ├── services/   # Chamadas à API do backend
        ├── contexts/   # AuthContext, etc.
        └── utils/
```

## Fases de desenvolvimento

| Fase | Conteúdo | Status |
|------|----------|--------|
| 1 | Estrutura, banco de dados, auth | ✅ Concluída |
| 2 | Backend: motor de mensagens e IA | 🔄 Próxima |
| 3 | Backend: Calendly, filas, follow-up | ⏳ |
| 4 | Frontend completo | ⏳ |
| 5 | Deploy e publicação | ⏳ |

## Primeiros passos

### 1. Configurar o banco de dados (Supabase)
1. Crie uma conta em [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Vá em **SQL Editor** e execute o arquivo `backend/src/config/schema.sql`
4. Copie a URL e a Service Key em **Settings > API**

### 2. Configurar o backend
```bash
cd backend
cp .env.example .env
# Edite o .env com suas chaves
npm install
npm run dev
```

### 3. Testar
```
GET http://localhost:3000/health
```

## Stack técnica
- **Backend**: Node.js 18+ · Express · Supabase · Bull Queue · node-cron
- **IA**: Groq (Llama 3.3 70B) + Gemini 1.5 Flash (fallback)
- **WhatsApp**: Evolution API
- **Frontend**: React + Tailwind CSS
- **Deploy**: Railway (backend) · GitHub Pages (frontend)
