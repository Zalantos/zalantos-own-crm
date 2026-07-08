# Variables de entorno — CRM Zalantos

Nunca incluir secretos reales en este documento. Ver `.env.example`.

| Variable | Servicio | Entorno | Requerida | Ejemplo seguro | Propósito | Fuente |
|----------|----------|---------|-----------|----------------|-----------|--------|
| `DATABASE_URL` | PostgreSQL | Todos | Sí | `postgresql://user:pass@host:5432/db` | Conexión principal (migraciones, system) | `.env.example`, `src/lib/prisma.ts` |
| `DATABASE_URL_SYSTEM` | PostgreSQL | Todos | No | igual que arriba | Rol alternativo para system client | `src/lib/prisma.ts` |
| `TENANT_DATABASE_URL` | PostgreSQL | Prod (recom.) | No | `postgresql://crm_app:pass@host:5432/db` | Cliente tenant con RLS | `src/lib/tenant.ts` |
| `SYSTEM_DB_POOL_MAX` | PostgreSQL | Todos | No | `5` | Pool conexiones system | `src/lib/prisma.ts` |
| `TENANT_DB_POOL_MAX` | PostgreSQL | Todos | No | `15` | Pool conexiones tenant | `src/lib/prisma.ts` |
| `AUTH_SECRET` | Auth.js | Todos | Sí | `openssl rand -base64 32` | Firma JWT | `.env.example` |
| `AUTH_TRUST_HOST` | Auth.js | Prod | Sí | `true` | Confiar en proxy | `.env.example` |
| `AUTH_URL` | Auth.js | Prod | No | `https://app.example.com` | URL pública auth | `.env.example` |
| `CRON_SECRET` | App crons | Prod | Sí* | random ≥16 chars | Proteger endpoints cron | `src/app/api/cron/*` |
| `ADMIN_EMAIL` | Seed | Dev | No** | `admin@example.com` | Usuario admin seed | `prisma/seed.ts` |
| `ADMIN_PASSWORD` | Seed | Dev | No** | strong password | Password admin seed | `prisma/seed.ts` |
| `GROQ_API_KEY` | Groq | Todos | Sí*** | `gsk_...` | Transcripción + LLM | `src/lib/meeting-intelligence/` |
| `GROQ_TRANSCRIPTION_MODEL` | Groq | Todos | No | `whisper-large-v3` | Modelo STT | `src/lib/meeting-intelligence/config.ts` |
| `GROQ_REASONING_MODEL` | Groq | Todos | No | `llama-3.3-70b-versatile` | Modelo razonamiento | `src/lib/meeting-intelligence/config.ts` |
| `R2_ACCOUNT_ID` | Cloudflare R2 | Prod | Sí*** | account id | Storage evidencia | `src/lib/meeting-intelligence/storage/r2.ts` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 | Prod | Sí*** | key id | Storage evidencia | idem |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 | Prod | Sí*** | secret | Storage evidencia | idem |
| `R2_BUCKET` | Cloudflare R2 | Prod | Sí*** | `crm-zalantos-evidence` | Nombre bucket | idem |
| `APP_URL` | App | Todos | Sí | `https://app.example.com` | URLs internas/callbacks | varios |
| `INTEGRATION_GATEWAY_URL` | Webhook | Prod | No | `https://host/webhook` | Despacho integraciones | `src/lib/integrations/gateway.ts` |
| `INTEGRATION_GATEWAY_SECRET` | Webhook | Prod | No | random string | Auth header gateway | idem |
| `SETTINGS_ENCRYPTION_KEY` | App crypto | Prod | Cond. | 32 bytes base64/hex | Cifrar secretos por org | `src/lib/crypto.ts` |
| `AGENT_MODEL` | IA SDK | Todos | No | `groq/llama-3.3-70b-versatile` | Modelo agente | `src/lib/agent/config.ts` |
| `MEETING_REASONING_MODEL` | IA SDK | Todos | No | `groq/llama-3.3-70b-versatile` | Modelo análisis reuniones | `src/lib/meeting-intelligence/ai/groq.ts` |
| `ANTHROPIC_API_KEY` | Anthropic | Todos | No | `sk-ant-...` | Modelo alternativo | `src/lib/agent/config.ts` |
| `OPENAI_API_KEY` | OpenAI | Todos | No | `sk-...` | Modelo alternativo | `src/lib/agent/config.ts` |
| `NODE_ENV` | Node | Todos | Auto | `production` | Entorno runtime | varios |

\* Requerida si se usan crons en producción.  
\** Requeridas solo para `npm run prisma:seed`.  
\*** Requeridas para funcionalidad completa de meetings/agent uploads.

## Agrupación por servicio

### PostgreSQL

`DATABASE_URL`, `DATABASE_URL_SYSTEM`, `TENANT_DATABASE_URL`,
`SYSTEM_DB_POOL_MAX`, `TENANT_DB_POOL_MAX`

### Auth

`AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL`

### Meeting Intelligence + Agente

`GROQ_*`, `AGENT_MODEL`, `MEETING_REASONING_MODEL`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `R2_*`, `APP_URL`

### Integraciones

`INTEGRATION_GATEWAY_URL`, `INTEGRATION_GATEWAY_SECRET`, `SETTINGS_ENCRYPTION_KEY`

### Operaciones

`CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`

## Gaps

- GAP: variables específicas de Railway no listadas (inyectadas por plataforma).
- GAP: `NOTION_*` u otras vars de `scripts/import-notion.ts` no detectadas en
  grep principal — revisar script antes de importar.
