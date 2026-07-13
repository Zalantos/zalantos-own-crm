# Integraciones externas — CRM Zalantos

## Resumen

| Servicio | Uso | Credenciales |
|----------|-----|--------------|
| PostgreSQL | Base de datos principal | `DATABASE_URL`, `TENANT_DATABASE_URL` |
| Groq | Transcripción (Whisper) y razonamiento LLM | `GROQ_API_KEY` |
| Anthropic | Modelo alternativo (agente/reuniones) | `ANTHROPIC_API_KEY` |
| OpenAI | Modelo alternativo (agente) | `OPENAI_API_KEY` |
| Cloudflare R2 | Evidencia y adjuntos | `R2_*` |
| Gateway webhook | Email, Slack, automaciones | `INTEGRATION_GATEWAY_*` |
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

## IA — Agente copiloto

| Config | Env |
|--------|-----|
| Modelo | `AGENT_MODEL` (formato `proveedor/modelo`) |
| Límite de pasos | Hardcoded: 8 (`src/lib/agent/config.ts`) |

Tools: lectura CRM, propuestas de escritura, adjuntos.

API: `POST /api/agent/chat` (streaming).

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
| `POST /api/cron/check-overdue` | Alertas de vencimiento |
| `POST /api/cron/send-task-reminders` | Recordatorios vía gateway |

Autenticación: `Authorization: Bearer <CRON_SECRET>`

Pipeline de meeting también: `POST /api/meetings/process`

## Webhooks entrantes

GAP: no hay webhooks entrantes públicos documentados (ej. Recall, Google Meet).
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

- GAP: documentación del workflow n8n del gateway.
- GAP: límites de rate y costos Groq en producción.
- GAP: integraciones de calendario/videollamada (Recall, Meet).
