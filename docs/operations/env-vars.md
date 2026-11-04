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
| `ALLOW_SEED` | Seed | Prod | No | `true` | Opt-in para seed en entorno desplegado (`RAILWAY_*` / production) | `prisma/seed.ts` |
| `GROQ_API_KEY` | Groq | Todos | Cond.*** | `gsk_...` | LLM y dictado; sin ella el dictado queda no disponible | `src/lib/runtime-config.ts`, `src/lib/voice-dictate.ts` |
| `GROQ_TRANSCRIBE_MODEL` | Groq | Todos | No | `whisper-large-v3-turbo` | Modelo STT del dictado efímero del copiloto | `src/lib/voice-dictate.ts` |
| `GROQ_REASONING_MODEL` | Groq | Todos | No | `openai/gpt-oss-120b` | Modelo razonamiento (id Groq; puede traer `/`) | `src/lib/runtime-config.ts` |
| `R2_ACCOUNT_ID` | Cloudflare R2 | Prod | No**** | account id | Lectura de fuentes históricas | `src/lib/storage/r2.ts` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 | Prod | No**** | key id | Lectura de fuentes históricas | idem |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 | Prod | No**** | secret | Lectura de fuentes históricas | idem |
| `R2_BUCKET` | Cloudflare R2 | Prod | No**** | `crm-zalantos-evidence` | Nombre bucket | idem |
| `APP_URL` | App | Todos | Sí | `https://app.example.com` | URLs internas/callbacks | varios |
| `INTEGRATION_GATEWAY_URL` | Webhook | Prod | No | `https://host/webhook` | Despacho integraciones saliente | `src/lib/integrations/gateway.ts` |
| `INTEGRATION_GATEWAY_SECRET` | Webhook / Telegram | Prod | Cond.**** | random string | Auth saliente (`x-webhook-secret`) y Bearer entrante Telegram | gateway + `src/lib/telegram/auth.ts` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Telegram UI | Todos | No | `mi_bot` | Handle del bot (sin `@`) en UI de vinculación | `admin/settings/telegram` |
| `WIKI_MCP_ALLOWED_ORG_IDS` | Wiki MCP | Prod | No | `org_id` | Organizaciones habilitadas; vacía apaga la integración | `src/lib/wiki-mcp/config.ts` |
| `WIKI_MCP_BASE_URL` | Wiki MCP | Prod | Cond.† | `https://wiki.example.com` | URL base de la Wiki, sin `/mcp` | idem |
| `WIKI_MCP_TOKEN` | Wiki MCP | Prod | Cond.† | `zwiki_...` | Token de la Wiki; si existe, no se usa Entra | idem |
| `WIKI_ENTRA_TENANT_ID` | Entra | Prod | No‡ | GUID | Directorio de Entra | idem |
| `WIKI_ENTRA_CLIENT_ID` | Entra | Prod | No‡ | GUID | Registro de aplicación del CRM | idem |
| `WIKI_ENTRA_CLIENT_SECRET` | Entra | Prod | No‡ | secret | Secreto del registro | idem |
| `WIKI_ENTRA_RESOURCE` | Entra | Prod | No‡ | `api://<GUID>` | API de la Wiki; se pide `{resource}/.default` | idem |
| `WIKI_MCP_TIMEOUT_MS` | Wiki MCP | Todos | No | `8000` | Timeout por llamada | idem |
| `SETTINGS_ENCRYPTION_KEY` | App crypto | Prod | Cond. | 32 bytes base64/hex | Cifrar secretos por org | `src/lib/crypto.ts` |
| `AGENT_MODEL` | IA SDK | Todos | No | `openai/gpt-6-luna` | Modelo del agente copiloto (`proveedor/` + id; 1ª `/` separa). Default: OpenAI gpt-6-luna | `src/lib/agent/config.ts` |
| `MEETING_REASONING_MODEL` | IA SDK | Todos | No | `groq/openai/gpt-oss-120b` | Fallback de `ENTITY_CONTEXT_MODEL` | `src/lib/entity-context/analyze.ts` |
| `ENTITY_CONTEXT_MODEL` | IA SDK | Todos | No | `groq/openai/gpt-oss-120b` | Modelo enriquecimiento de fichas (fallback: MEETING_REASONING_MODEL) | `src/lib/entity-context/analyze.ts` |
| `ANTHROPIC_API_KEY` | Anthropic | Todos | No | `sk-ant-...` | Modelo alternativo | `src/lib/agent/config.ts` |
| `OPENAI_API_KEY` | OpenAI | Todos | Sí (agente) | `sk-...` | Agente copiloto (`gpt-6-luna` por defecto) | `src/lib/agent/model.ts` |
| `OBSERVABILITY_BASE_URL` | Observability | Todos | No | `https://observ.zalantos.com` | Base URL ingesta costos IA | `src/lib/observability/reporter.ts` |
| `OBSERVABILITY_API_KEY` | Observability | Todos | No | api key | Auth `X-Api-Key` para ingesta | `src/lib/observability/reporter.ts` |
| `COMMERCIAL_EVENTS_SECRET` | Integraciones | Prod | No (opcional; por defecto acepta `INBOUND_LEADS_SECRET`/`INTEGRATION_GATEWAY_SECRET`) | random ≥16 chars | Bearer de `POST /api/integrations/activities` (interacciones email/WhatsApp vía n8n) | `src/app/api/integrations/activities/route.ts` |
| `RUMBO_CALLBACK_SECRET` | Rumbo | Prod | No (opcional; por defecto acepta el secreto del gateway) | random ≥16 chars | Bearer del callback `POST /api/integrations/rumbo/handoff-status` | `src/app/api/integrations/rumbo/handoff-status/route.ts` |
| `INTEGRATIONS_ORGANIZATION_SLUG` | Integraciones | Prod | No | `zalantos` | Org destino de integraciones entrantes (fallback `INBOUND_LEADS_ORGANIZATION_SLUG`) | `src/lib/integrations/inbound-auth.ts` |
| `NODE_ENV` | Node | Todos | Auto | `production` | Entorno runtime | varios |

\* Requerida si se usan crons en producción.  
\** Requeridas solo para `npm run prisma:seed`.  
\*** Requeridas para funcionalidad completa de meetings/agent uploads.  
\**** Requerida si se usa gateway saliente y/o canal Telegram entrante.

## Agrupación por servicio

### PostgreSQL

`DATABASE_URL`, `DATABASE_URL_SYSTEM`, `TENANT_DATABASE_URL`,
`SYSTEM_DB_POOL_MAX`, `TENANT_DB_POOL_MAX`

### Auth

`AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL`

### Agente y enriquecimiento

`GROQ_*`, `AGENT_MODEL`, `MEETING_REASONING_MODEL`, `ENTITY_CONTEXT_MODEL`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `R2_*`, `APP_URL`

### Observability (costos IA)

`OBSERVABILITY_BASE_URL`, `OBSERVABILITY_API_KEY`

### Integraciones + Telegram

`INTEGRATION_GATEWAY_URL`, `INTEGRATION_GATEWAY_SECRET`,
`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `SETTINGS_ENCRYPTION_KEY`

### MCP

No agrega variables de entorno. El endpoint público usa `APP_URL` y los tokens
personales se crean desde `/admin/settings/mcp`.

### Wiki MCP

`WIKI_MCP_ALLOWED_ORG_IDS`, `WIKI_MCP_BASE_URL`, `WIKI_MCP_TOKEN`,
`WIKI_MCP_TIMEOUT_MS`. † Requeridas si `WIKI_MCP_ALLOWED_ORG_IDS` tiene valor.
‡ `WIKI_ENTRA_*` solo hacen falta si no se usa `WIKI_MCP_TOKEN`. Ver
`docs/integrations/wiki-mcp.md`.

### Operaciones

`CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ALLOW_SEED`

## Gaps

- GAP: variables específicas de Railway no listadas (inyectadas por plataforma).
- GAP: `NOTION_*` u otras vars de `scripts/import-notion.ts` no detectadas en
  grep principal — revisar script antes de importar.

\*\*\*\* Solo se usan para reintentar fuentes de contexto históricas sin texto. Se pueden retirar según `docs/architecture/knowledge-sources.md`. `GROQ_TRANSCRIPTION_MODEL` ya no se usa.
