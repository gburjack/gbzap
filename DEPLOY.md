# GbZap — Guia de Deploy Completo

## Pré-requisitos

Antes de começar, tenha em mãos:
- Conta no GitHub (gratuita)
- Acesso ao terminal do computador
- Número de WhatsApp exclusivo para o negócio (não use o pessoal)

---

## Etapa 1 — Supabase (banco de dados)

**Site:** https://supabase.com | **Custo:** Gratuito

1. Crie uma conta em supabase.com
2. Clique em **New project**
3. Nome: `gbzap` | Região: **South America (São Paulo)**
4. Vá em **SQL Editor** e execute todo o conteúdo de `backend/src/config/schema.sql`
5. Vá em **Settings > API** e copie:
   - `Project URL` → será seu `SUPABASE_URL`
   - `service_role` (secret) → será seu `SUPABASE_SERVICE_KEY`

> ⚠️ Use a `service_role`, não a `anon key`.

---

## Etapa 2 — Upstash Redis (filas Bull)

**Site:** https://upstash.com | **Custo:** Gratuito

1. Crie conta em upstash.com
2. **Create Database** → tipo **Redis**
3. Nome: `gbzap-queues` | Região: Brazil (São Paulo) | Plano: Free
4. Copie a **REDIS_URL** (começa com `rediss://`)

---

## Etapa 3 — Railway (backend)

**Site:** https://railway.app | **Custo:** $5/mês de crédito gratuito

1. Crie conta com GitHub em railway.app
2. **New Project > Deploy from GitHub repo** → selecione o repositório GbZap
3. Em **Settings**, defina **Root Directory** como `/backend`
4. Em **Variables**, adicione todas as variáveis:

```env
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
JWT_SECRET=<gere com o comando abaixo>
REDIS_URL=rediss://default:senha@host.upstash.io:6379
ADMIN_EMAIL=admin@suaemail.com
ADMIN_PASSWORD=senha-forte-aqui
FRONTEND_URL=https://seu-usuario.github.io/gbzap
BACKEND_URL=https://seu-app.up.railway.app
```

**Gerar JWT_SECRET** (execute no terminal):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

5. Após o deploy, teste:
```
GET https://seu-backend.railway.app/health
# Deve retornar: {"status":"ok"}
```

---

## Etapa 4 — GitHub Pages (frontend)

**Custo:** Gratuito

### 4.1 Configurar o repositório

1. Vá em **Settings > Secrets and variables > Actions**
2. Clique em **New repository secret**:
   - Name: `VITE_API_URL`
   - Value: `https://seu-backend.railway.app/api`

3. Vá em **Settings > Pages**:
   - Source: **GitHub Actions**

### 4.2 Ajustar o nome do repositório no Vite

Edite `frontend/vite.config.js` e ajuste o `base` para o nome exato do seu repositório:

```js
base: '/nome-do-seu-repositorio/',
```

Faça o mesmo em `frontend/src/main.jsx`:

```jsx
<BrowserRouter basename="/nome-do-seu-repositorio">
```

### 4.3 Fazer o deploy

```bash
git add .
git commit -m "feat: deploy GbZap"
git push origin main
```

Acompanhe em **Actions** no GitHub. Em ~3 minutos o site estará em:
```
https://seu-usuario.github.io/nome-do-repositorio/
```

---

## Etapa 5 — Evolution API (WhatsApp)

**Site:** https://evolution-api.com | **Custo:** Gratuito (self-hosted)

### Opção A — Cloud (recomendado para começar)
Acesse evolution-api.com e crie uma conta no plano cloud.

### Opção B — Self-hosted com Docker
```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=sua-chave-secreta \
  -e SERVER_URL=https://sua-url.com \
  atendai/evolution-api:latest
```

### Configurar no painel GbZap

1. Acesse seu painel em `https://seu-usuario.github.io/gbzap`
2. Faça login e vá em **Integrações**
3. Preencha:
   - **Evolution API URL**: `https://sua-evolution.com`
   - **Evolution API Key**: sua chave
4. Salve e clique em **Conectar WhatsApp**
5. Escaneie o QR Code no WhatsApp do celular:
   - Configurações → Dispositivos vinculados → Vincular dispositivo

---

## Etapa 6 — Chaves de IA

### Groq (IA principal — gratuito)

1. Acesse https://console.groq.com
2. Crie conta e vá em **API Keys**
3. Clique em **Create API Key** e copie a chave (`gsk_...`)

### Gemini (fallback + imagens — gratuito)

1. Acesse https://aistudio.google.com
2. Clique em **Get API Key** → **Create API Key**
3. Copie a chave (`AIza...`)

### Configurar no painel

Vá em **Integrações > Chaves de API** e preencha ambas.

---

## Etapa 7 — Calendly (agendamentos)

**Site:** https://calendly.com | **Custo:** Gratuito (1 tipo de evento)

1. Crie conta em calendly.com
2. Crie um **Event Type** com nome, duração e disponibilidade
3. Copie a URL pública: `https://calendly.com/seu-usuario/consulta`
4. Vá em **Integrations > API & Webhooks** e gere um token pessoal

### Configurar webhook

No painel do Calendly, adicione um webhook:
```
URL: https://seu-backend.railway.app/webhook/calendly/SEU-CLIENT-ID
Eventos: invitee.created, invitee.canceled
```

> Encontre seu CLIENT-ID no banco Supabase: tabela `clients`, coluna `id`.

### Configurar no painel GbZap

Vá em **Integrações** e preencha a URL do evento e a API Key.

---

## Checklist final

Antes de abrir para clientes, verifique:

- [ ] `GET /health` retorna `{"status":"ok"}`
- [ ] Login no painel funciona
- [ ] WhatsApp aparece como "Conectado"
- [ ] Envie uma mensagem para o número e a IA responde
- [ ] Áudio transcrito corretamente
- [ ] Imagem interpretada pelo Gemini
- [ ] Agendamento via Calendly gera confirmação no WhatsApp
- [ ] Dashboard mostra as métricas
- [ ] Painel admin acessível em `/admin`

---

## Solução de problemas comuns

### "Cannot find module" no Railway
Verifique se o Root Directory está configurado como `/backend` e se o `package.json` tem `"type": "module"`.

### Frontend em branco (GitHub Pages)
Confirme que o `base` no `vite.config.js` e o `basename` no `BrowserRouter` usam exatamente o mesmo nome do repositório, com `/` no início e no fim.

### WhatsApp desconectando
Normal nos primeiros dias — o número está sendo aquecido. Reconecte pelo painel clicando em **Conectar WhatsApp** novamente.

### IA não responde
1. Verifique se a Groq API Key está correta em Integrações
2. Verifique os logs no Railway (aba Deployments > View logs)
3. Confirme que o webhook da Evolution está configurado com a URL correta

### Redis não conecta
Verifique se a REDIS_URL começa com `rediss://` (com duplo S) para conexões TLS do Upstash.

---

## Estrutura de custos

| Serviço | Plano | Custo |
|---------|-------|-------|
| Supabase | Free | R$ 0 |
| Upstash Redis | Free | R$ 0 |
| Railway | Hobby | ~R$ 25/mês |
| GitHub Pages | Free | R$ 0 |
| Evolution API | Self-hosted | R$ 0 |
| Groq | Free | R$ 0 |
| Gemini | Free | R$ 0 |
| Calendly | Free | R$ 0 |
| **Total inicial** | | **~R$ 25/mês** |

---

## Próximos passos após o deploy

1. Configure sua base de conhecimento completa em **Configurações**
2. Ajuste os horários de atendimento conforme sua operação
3. Monitore os Gaps de IA em **Agendamentos > Gaps de IA** e melhore o FAQ
4. Acompanhe o aquecimento do número no **Dashboard**
5. Após 7 dias de aquecimento, remova o limite de mensagens

---

*GbZap v1.0 — Sistema completo funcional*
