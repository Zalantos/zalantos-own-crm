# Contexto extendido — CRM Zalantos

## Módulos principales

### `src/app/`

| Ruta / área                         | Responsabilidad                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `/`                                 | Landing pública de marketing; sin registro ni acceso a datos CRM                 |
| `(dashboard)/`                      | CRM operativo: companies, people, opportunities, activities, meetings, audit-log |
| `(dashboard)/admin/`                | Configuración por organización                                                   |
| `(superadmin)/`                     | Gestión de tenants                                                               |
| `login`, `invite`, `reset-password` | Auth y provisioning                                                              |
| `api/`                              | Route handlers (agent, telegram, crons, auth)                          |
| `admin/settings/telegram`           | Vinculación de chats Telegram                                                    |

Lista y tablero de oportunidades comparten las etapas ocultas en la cookie
`opportunity-hidden-stages` del navegador.

### `src/lib/`

| Módulo                       | Responsabilidad                                           |
| ---------------------------- | --------------------------------------------------------- |
| `tenant.ts`                  | Cliente Prisma con scope de org + RLS                     |
| `prisma.ts`                  | Clientes system y tenant base                             |
| `auth.ts` / `auth.config.ts` | Auth.js credentials + middleware                          |
| `session.ts`                 | Helpers de sesión                                         |
| `ai-changes/`                | Motor de bitácora IA: aplicar y deshacer cambios          |
| `documents/`, `storage/`     | Extracción de texto; lectura R2 histórica                 |
| `entity-context/`            | Enriquecimiento de fichas: sources, perfil IA, propuestas |
| `agent/`                     | Copiloto: tools, executor y bitácora de cambios           |
| `telegram/`                  | Auth Bearer del canal n8n → CRM                           |
| `integrations/`              | Gateway webhook, plantillas email                         |
| `workflows/`                 | Motor de workflows                                        |
| `crm/`                       | Políticas de propuestas, dedup de personas                |
| `crypto.ts`                  | Cifrado de secretos por org                               |
| `observability/`             | Reporte best-effort de costos IA                          |

## Flujo de datos

```txt
Browser → Next.js (RSC + Server Actions)
              ↓
         requireOrgContext() / auth()
              ↓
         forOrg(orgId)  ──→  PostgreSQL (RLS opcional)
              ↓
         prismaSystem (auth, superadmin, crons cross-tenant)
```

### Reuniones comerciales

Una reunión es una actividad registrada (`type=meeting`) desde la ficha o con
`create_meeting`. Meeting Intelligence se retiró (DEC-011).

### Agente IA

```txt
POST /api/agent/chat
       ↓
AI SDK stream + tools (read CRM, execute traced changes)
       ↓
Bitácora en CRMChangeProposal/CRMChangeItem (channel=web)
```

El chat puede adjuntar documentos o texto manual; ambos se normalizan a
`AgentAttachment.extractedText` y entran al prompt como contexto del thread.

Tool `confirm_pending_proposal`: compatibilidad para propuestas legacy y futuras
acciones destructivas. Una confirmación explícita puede aplicar el lote completo;
no existe un límite por cantidad de ítems.

### Telegram ↔ Copiloto

```txt
Telegram → n8n → POST /api/telegram/context|message|link
       ↓
Resolver TelegramLink (prismaSystem) → forOrg + AgentChatThread
       ↓
Mismo executor del agente (sin streaming) → { output }
```

Detalle de contrato: `docs/integrations/telegram-copiloto.md`.

Las tareas pueden crearse o reasignarse desde cualquier canal con
`create_task`, `update_task` o `assign_task`. El responsable se resuelve contra
un `TeamMember` activo por id, usuario vinculado, email o nombre inequívoco;
`list_team_members` permite desambiguar.

### Entity context enrichment

```txt
Upload en ficha (company/person/opportunity)
   · texto manual pegado por el usuario (`sourceType=manual`)
       ↓
registerManualContextSource con `extractedText` directo
       ↓
schedulePipeline
       ↓
after(runEntityContextPipeline)
       ↓
extract por archivo → UN análisis consolidado del lote
       → EntityContextProfile + Note (auto)
       → UNA CRMChangeProposal (source=enrichment, channel=enrichment)
         aplicada por ítem, con campos CRM incluido el perfil comercial de Company
       ↓
Usuario revisa trazabilidad o deshace en Actividad de IA
```

El pipeline acepta varios archivos por corrida: si un archivo falla en
extracción se marca `failed` y el resto del lote continúa. El cron catch-up
agrupa fuentes atascadas por entidad y las procesa en lote.

## Servicios internos

- **Tenant client** (`forOrg`): todas las operaciones CRM de un usuario logueado.
- **System client** (`prismaSystem`): usuarios, orgs, crons que iteran tenants.
- **Rate limit** (`src/lib/rate-limit.ts`): in-memory; GAP bajo escalado horizontal.

## Jobs / crons

Endpoints POST protegidos con `Authorization: Bearer <CRON_SECRET>`:

| Endpoint                           | Función                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `/api/cron/process-entity-context` | Reprocesa fuentes de contexto atascadas                                          |
| `/api/cron/check-overdue`          | Oportunidades/actividades vencidas                                               |
| `/api/cron/send-task-reminders`    | Resumen de tareas abiertas del día (y vencidas) a las 18:00, por mail y Telegram |
| `/api/cron/commercial-follow-ups`  | Tarea por reactivación de pausadas y reconciliación de alertas por etapa         |

GAP: configuración de schedule en Railway no versionada en el repo. Ese cron
conviene invocarlo al menos una vez por hora: cada org envía solo si su hora
local ya es ≥ 18:00, una vez por responsable y canal.

## Auth

- Auth.js v5, provider Credentials, sesión JWT 10h.
- Middleware en `auth.config.ts` protege rutas y roles; `/` queda público para
  la landing y `/login` es la entrada al CRM.
- Invitaciones y reset de password vía tokens hasheados (sha256).

## Manejo de errores

- Server Actions retornan errores al cliente vía toast/estado.
- Pipeline de meetings: `processingStatus=failed` + `processingError`.
- Prisma: helpers en `src/lib/prisma-errors.ts`.

## Observabilidad

- Logs estándar de Next.js/Node.
- GAP: sin integración APM/Sentry documentada.

## Riesgos técnicos

- Pool de conexiones tenant bajo fan-out de `Promise.all` en RSC.
- Rate limit no distribuido entre réplicas.
- Dependencia de APIs externas (Groq) en el análisis de contexto.

## Deuda técnica

- Cobertura de tests mínima (solo `reporter.test.ts` / `test:observability`).
- Participantes de meeting como JSON libre (sin FK a Person aún).
- Billing no implementado.
- Workflows n8n (gateway saliente y Telegram) no versionados en el repo.

## Proceso comercial (HU-CRM-02)

Detalle completo en `docs/context/commercial-process.md`. Código:

- `src/lib/commercial/` — servicios de dominio puros por tenant:
  `leads.ts` (prospección), `opportunity-service.ts` (etapas con compuertas,
  estados, propuesta, próxima acción), `partners.ts` (constantes, seguras para
  cliente) + `partner-service.ts`, `attribution.ts`, `history.ts`,
  `next-action.ts` (reglas), `follow-up.ts` (carga + sugerencia IA bajo
  demanda), `funnel.ts` (métricas), `rumbo.ts` (handoff),
  `activity-ingest.ts`, `links.ts` (validación de vínculos por org),
  `ai-items.ts` (ítems reversibles de la bitácora IA).
- Las server actions (`src/app/(dashboard)/{prospecting,opportunities,partners,commercial}/`)
  son envoltorios delgados de esos servicios.
- Agente/MCP: `src/lib/agent/tools/commercial.ts` (`create_prospect`,
  `update_lead_status`, `convert_lead_to_opportunity`,
  `set_opportunity_status`, `set_next_action`, `log_interaction`,
  `list_commercial_leads`, `get_commercial_origin`, `list_partners`,
  `get_commercial_funnel`, `suggest_next_actions`). Las escrituras pasan por
  `registerProposalChange` → `applyProposal`, con tipos de ítem
  `status_change`, `add_commercial_lead`, `commercial_lead_status`,
  `convert_lead`, `set_next_action`, todos reversibles.
- `stage_change`/`update_field(stage)` aplican las compuertas y registran
  historial; `update_record_fields` rechaza `status`/`lossReason` (se usa
  `set_opportunity_status`). Keys legacy de etapa devuelven la acción correcta.
- Workflows: condiciones `stage` aceptan id o key; eventos nuevos
  `status_changed` (oportunidad) y `reactivation_due`; no ejecutan acciones
  sobre oportunidades cerradas.
