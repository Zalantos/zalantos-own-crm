# Integraciones externas — CRM Zalantos

## Resumen

| Servicio | Uso | Credenciales |
|----------|-----|--------------|
| PostgreSQL | Base de datos principal | `DATABASE_URL`, `TENANT_DATABASE_URL` |
| Groq | Transcripción (Whisper) y razonamiento de reuniones/fichas | `GROQ_API_KEY` |
| Anthropic | Modelo alternativo (agente/reuniones) | `ANTHROPIC_API_KEY` |
| OpenAI | Agente copiloto (`gpt-6-luna` por defecto) | `OPENAI_API_KEY` |
| Cloudflare R2 | Evidencia y adjuntos | `R2_*` |
| Gateway webhook | Email, Slack, automaciones (saliente) | `INTEGRATION_GATEWAY_*` |
| Telegram (vía n8n) | Canal entrante al copiloto IA | `INTEGRATION_GATEWAY_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` |
| Inbound Leads (vía n8n) | Bandeja de leads externos (`/leads`) | `INBOUND_LEADS_SECRET`, `INBOUND_LEADS_ORGANIZATION_SLUG` |
| MCP | Tools CRM para Cursor u otros clientes | Token personal `zcrm_…` (solo hash en BD) |
| Zalantos Observability | Reporte best-effort de costos/tokens de IA | `OBSERVABILITY_BASE_URL`, `OBSERVABILITY_API_KEY` |

## Gateway de integraciones

**Archivo:** `src/lib/integrations/gateway.ts`

El CRM despacha eventos al webhook externo con:

- Header `x-webhook-secret`
- Payload JSON con tipo, canal, entidad, destinatario
- Registro en `IntegrationDelivery` con dedupe por `dedupeKey`

Configuración:

- Global: `INTEGRATION_GATEWAY_URL`, `INTEGRATION_GATEWAY_SECRET`
- Por org: `Organization.integrationGatewayUrl`, `integrationGatewaySecret`
  (cifrado con `SETTINGS_ENCRYPTION_KEY`)

Estados de delivery: `pending` → `sent` | `failed`

**Riesgo:** si el gateway está caído, los deliveries quedan en `failed` con
`lastError`. GAP: estrategia de reintento automático no documentada en código.

## IA — Meeting Intelligence

| Paso | Proveedor | Env |
|------|-----------|-----|
| Transcripción audio/video | Groq Whisper | `GROQ_TRANSCRIPTION_MODEL` |
| Análisis y propuestas | Groq/Anthropic/OpenAI | `MEETING_REASONING_MODEL` |

Prompts en `src/lib/meeting-intelligence/prompts/*.md`.

## IA — Dictado del copiloto web

El panel del copiloto ofrece dictado efímero: el navegador graba con
`MediaRecorder` y sube el blob autenticado a `POST /api/portal/voice/transcribe`.
El servidor usa el endpoint OpenAI-compatible de Groq con
`GROQ_TRANSCRIBE_MODEL` (default `whisper-large-v3-turbo`) y devuelve el texto
para pegarlo en el composer; nunca envía el mensaje ni persiste el audio o la
transcripción. `GET /api/portal/voice/status` comunica si `GROQ_API_KEY` está
configurada. La llamada a Groq vence a los 30 segundos y se aborta si el
cliente cierra la conexión.

Observability, si está activa, recibe únicamente bytes, proveedor `groq` y el
resultado de la transcripción; no recibe audio, texto, usuario ni tenant.

## IA — Agente copiloto

| Config | Env |
|--------|-----|
| Modelo | `AGENT_MODEL` (formato `proveedor/modelo`). Default: `openai/gpt-6-luna` |
| Límite de pasos | Hardcoded: 8 (`src/lib/agent/config.ts`) |
| Confirmación por chat | Máx. 1 ítem (`maxChatConfirmItems`) |

Tools: lectura CRM, propuestas de escritura, adjuntos, y
`confirm_pending_proposal` (aplicar/rechazar la propuesta pendiente del thread;
pensado para Telegram, donde no hay UI de revisión).

API web: `POST /api/agent/chat` (streaming).

## MCP

El servidor MCP vive dentro del mismo proceso Next.js en `/api/mcp`; no hay un
servicio, worker ni modelo de IA adicional. Usa Streamable HTTP stateless y
exige `Authorization: Bearer <token personal>` en cada request.

El lookup inicial del hash usa `prismaSystem`; después de resolver al usuario y
su organización activa, todas las tools usan `forOrg(organizationId)`. Las
lecturas y las escrituras "seguras" son directas: `create_note`, `create_task`
(con responsable `assigneeId`/`assigneeEmail` y `priority`), `create_activity`
(actividad ya ocurrida), `create_meeting` (reunión sin transcripción),
`update_task` y `complete_task`; `list_tasks` lista tareas con filtros. Cada
llamada MCP es su propio turno, así que estas escrituras siempre se aplican al
instante; en el chat del copiloto, a partir del segundo cambio de un turno
caen en la propuesta del turno (ítems `log_activity`, `create_meeting`,
`update_task`, aplicables y reversibles en `apply.ts`). Cambios de
campos/etapa y altas crean propuestas `source=agent`, `model=mcp`, visibles
en `/agent/proposals`.
`confirm_proposal` opera por id: puede aplicar una propuesta de un ítem o
derivar propuestas mayores a la bandeja web.

UI admin: `/admin/settings/mcp` (crear, copiar una vez y revocar tokens propios).
La URL publicada se construye con `APP_URL`; MCP no agrega variables nuevas.

## Inbound Leads (webhook entrante)

Detalle completo: `docs/integrations/inbound-leads.md`.

n8n reenvía el formulario web de Zalantos a `POST
/api/integrations/inbound-leads`. Auth: `Authorization: Bearer
<INBOUND_LEADS_SECRET>` (secreto dedicado, no el del gateway saliente). La
organización se resuelve por slug fijo (`INBOUND_LEADS_ORGANIZATION_SLUG`),
nunca la elige el caller. El endpoint solo crea un `InboundLead(status=new)`
en bandeja (`/leads`) — nunca Company/Person/Opportunity directo; eso requiere
conversión manual. Idempotente por `(organizationId, source, externalId)`.

## Telegram ↔ Copiloto (webhooks entrantes)

Detalle completo: `docs/integrations/telegram-copiloto.md`.

n8n actúa de cartero (Telegram Trigger → HTTP al CRM). Endpoints:

| Ruta | Propósito |
|------|-----------|
| `POST /api/telegram/link` | Handshake `/vincular <código>` |
| `POST /api/telegram/context` | Gate: ¿chat vinculado? |
| `POST /api/telegram/message` | Turno del copiloto (sin streaming) |

Auth: `Authorization: Bearer <INTEGRATION_GATEWAY_SECRET>` (timing-safe).
Identidad: `telegram_chat_id` → `TelegramLink` → `User` / `organizationId`.
Memoria: `AgentChatThread` ligado a `telegram_links.agentThreadId`.

UI admin: `/admin/settings/telegram` (código efímero + lista de vínculos).

## Observability — costos de IA

**Archivo:** `src/lib/observability/reporter.ts`

Tras cada ejecución de IA (éxito o error) se envía un evento single a
`POST {OBSERVABILITY_BASE_URL}/api/v1/ingest/ai-event` con header `X-Api-Key`.

| Flujo | `usage_kind` | `flow_slug` |
|-------|--------------|-------------|
| Agente copiloto | `agent_run` | `agent-chat` |
| Razonamiento de reuniones | `extraction` | `meeting-reasoning` |
| Enriquecimiento de fichas | `extraction` | `entity-context` |
| Transcripción Whisper | `transcription` | `meeting-transcription` |

- `service_name`: `backend`
- `service_slug`: `crm-zalantos`
- Best-effort: timeout corto, 1 retry idempotente; si Observability está caído
  o faltan env vars, el CRM no falla.
- No se envían `input_text` / `output_text`.

## Almacenamiento — Cloudflare R2

- S3-compatible API vía `@aws-sdk/client-s3`.
- Bucket: `R2_BUCKET`
- Presign upload: `POST /api/evidence/presign`
- Adjuntos agente: `POST /api/agent/attachments`

Si R2 no está configurado, adjuntos de texto pueden funcionar sin storage.

## Auth

- Auth.js v5 — no es integración externa OAuth en v1.
- `AUTH_SECRET`, `AUTH_TRUST_HOST`, opcional `AUTH_URL`.

## Crons (invocación externa)

Endpoints internos que un scheduler debe llamar:

| Ruta | Propósito |
|------|-----------|
| `POST /api/cron/process-evidence` | Catch-up pipeline meetings |
| `POST /api/cron/process-entity-context` | Catch-up enriquecimiento de fichas |
| `POST /api/cron/check-overdue` | Alertas de vencimiento |
| `POST /api/cron/send-task-reminders` | Resumen diario de tareas vencidas (18:00, timezone de la org) por mail y Telegram |

Autenticación: `Authorization: Bearer <CRON_SECRET>`

`send-task-reminders` no cambia el estado del tablero. A partir de las 18:00
hora local de cada organización manda **un resumen por responsable**: tareas
abiertas (`todo`, `in_progress`, `blocked`) planeadas para ese día, o con
`dueDate` de hoy o anterior. El texto las trata como vencidas. Canales:
`email` si el `TeamMember` tiene email, y `telegram` si su usuario tiene un
`TelegramLink` activo. Dedupe diario:
`task.daily_overdue:{email|telegram}:{assigneeId}:{YYYY-MM-DD}`.

El scheduler es externo. Hay que invocarlo al menos una vez por hora para que
cada timezone cruce las 18:00. Si se llama antes, no se envía nada y la
respuesta cuenta esa org en `deferred`. El payload de mail trae `subject`, `text` y `html`; el de
Telegram trae `text`. Tipo de notificación: `task.daily_overdue`.

Pipeline de meeting también: `POST /api/meetings/process`

## Webhooks entrantes

Documentados hoy:

- Canal Telegram vía n8n (`/api/telegram/*`) — ver sección arriba.
- Inbound Leads vía n8n (`/api/integrations/inbound-leads`) — ver sección arriba.

GAP: webhooks de calendario/videollamada (Recall, Google Meet) no implementados.
El campo `Meeting.sourceType` anticipa orígenes futuros.

## Entornos

| Variable | Dev | Prod |
|----------|-----|------|
| `APP_URL` | `http://localhost:3000` | URL pública Railway |
| Gateway | Local/staging n8n | Prod n8n |
| R2 | Bucket dev | Bucket prod |
| Groq | Misma API key (cuidado con costos) | Key de prod |

## Riesgos

- Exposición de `CRON_SECRET` permite ejecutar crons.
- API keys de IA en variables de entorno del servidor.
- Gateway externo recibe datos de clientes (PII en payloads de email).

## Gaps

- GAP: workflow n8n del gateway saliente no versionado en el repo (solo
  contrato HTTP). Tiene que aceptar `notificationType=task.daily_overdue` en
  los canales `email` y `telegram`, usando `payload.html` / `payload.text` /
  `payload.subject` (mail) y `payload.text` (Telegram). El tipo anterior
  `task.overdue` / `task.due_soon` (un mail por tarea) ya no se emite.
- GAP: workflow n8n de Telegram no versionado (contrato en
  `docs/integrations/telegram-copiloto.md`).
- GAP: límites de rate y costos Groq en producción.
- GAP: integraciones de calendario/videollamada (Recall, Meet).
