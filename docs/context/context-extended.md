# Contexto extendido — CRM Zalantos

## Módulos principales

### `src/app/`

| Ruta / área | Responsabilidad |
|-------------|-----------------|
| `(dashboard)/` | CRM operativo: companies, people, opportunities, activities, meetings, audit-log |
| `(dashboard)/admin/` | Configuración por organización |
| `(superadmin)/` | Gestión de tenants |
| `login`, `invite`, `reset-password` | Auth y provisioning |
| `api/` | Route handlers (agent, crons, auth, evidence) |

### `src/lib/`

| Módulo | Responsabilidad |
|--------|-----------------|
| `tenant.ts` | Cliente Prisma con scope de org + RLS |
| `prisma.ts` | Clientes system y tenant base |
| `auth.ts` / `auth.config.ts` | Auth.js credentials + middleware |
| `session.ts` | Helpers de sesión |
| `meeting-intelligence/` | Pipeline, extracción, transcripción, IA, R2 |
| `agent/` | Copiloto: tools, executor, propuestas |
| `integrations/` | Gateway webhook, plantillas email |
| `workflows/` | Motor de workflows |
| `crm/` | Políticas de propuestas, dedup de personas |
| `crypto.ts` | Cifrado de secretos por org |

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

### Meeting Intelligence

```txt
Upload evidence → R2 presign
       ↓
POST /api/meetings/process (o cron catch-up)
       ↓
runPipeline: extract → transcribe → analyze → CRMChangeProposal
       ↓
Usuario revisa en UI → apply/reject items
```

### Agente IA

```txt
POST /api/agent/chat
       ↓
AI SDK stream + tools (read CRM, write proposals)
       ↓
Propuestas en CRMChangeProposal (source=agent)
```

## Servicios internos

- **Tenant client** (`forOrg`): todas las operaciones CRM de un usuario logueado.
- **System client** (`prismaSystem`): usuarios, orgs, crons que iteran tenants.
- **Rate limit** (`src/lib/rate-limit.ts`): in-memory; GAP bajo escalado horizontal.

## Jobs / crons

Endpoints POST protegidos con `Authorization: Bearer <CRON_SECRET>`:

| Endpoint | Función |
|----------|---------|
| `/api/cron/process-evidence` | Reprocesa meetings atascados en pipeline |
| `/api/cron/check-overdue` | Oportunidades/actividades vencidas |
| `/api/cron/send-task-reminders` | Recordatorios de tareas vía gateway |

GAP: configuración de schedule en Railway no versionada en el repo.

## Auth

- Auth.js v5, provider Credentials, sesión JWT 10h.
- Middleware en `auth.config.ts` protege rutas y roles.
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
- Dependencia de APIs externas (Groq, R2) en pipeline crítico.

## Deuda técnica

- Sin tests automatizados.
- Participantes de meeting como JSON libre (sin FK a Person aún).
- Billing no implementado.
