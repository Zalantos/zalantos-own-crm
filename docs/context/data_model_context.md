# Modelo de datos — CRM Zalantos

Fuente de verdad: `prisma/schema.prisma`.

## Entidades principales

### Multi-tenancy y auth

| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| `Organization` | `organizations` | Tenant; settings inline (moneda, timezone, branding, gateway) |
| `User` | `users` | Usuario; `organizationId` nullable solo para super-admins |
| `Invitation` | `invitations` | Invitaciones por email con token hasheado |
| `PasswordResetToken` | `password_reset_tokens` | Reset de contraseña |
| `TeamMember` | `team_members` | Catálogo de asignables a tareas (vínculo opcional a User) |
| `PipelineStage` | `pipeline_stages` | Etapas del pipeline por org (`key` estable) |

### CRM core

| Modelo | Tabla | Relaciones clave |
|--------|-------|------------------|
| `Company` | `companies` | → opportunities, people, meetings, activities |
| `Person` | `people` | → company (opcional); roles en opportunities |
| `Opportunity` | `opportunities` | → company, stage, decisionMaker, sponsor |
| `Activity` | `activities` | → company/person/opportunity, assignee (TeamMember) |
| `Note` | `notes` | → company/person/opportunity |

### Extensibilidad

| Modelo | Tabla | Notas |
|--------|-------|-------|
| `CustomFieldDefinition` | `custom_field_definitions` | Por `EntityType` |
| `CustomFieldValue` | `custom_field_values` | Valores tipados |
| `SavedView` | `saved_views` | Filtros/columnas por entidad |

### Automatización

| Modelo | Tabla | Notas |
|--------|-------|-------|
| `Workflow` | `workflows` | trigger + conditions + actions en JSON |
| `WorkflowLog` | `workflow_logs` | Auditoría de ejecución |
| `IntegrationDelivery` | `integration_deliveries` | Cola de despacho al gateway; dedupe por org |

### Meeting Intelligence

| Modelo | Tabla | Notas |
|--------|-------|-------|
| `Meeting` | `meetings` | `processingStatus` enum; evidencia y propuestas |
| `Evidence` | `evidence` | Archivos en R2; `extractedText` |
| `CRMChangeProposal` | `crm_change_proposals` | Origen `meeting` o `agent` |
| `CRMChangeItem` | `crm_change_items` | Items atómicos con reversión |
| `TimelineEvent` | `timeline_events` | Historial por empresa |

### Agente IA

| Modelo | Tabla | Notas |
|--------|-------|-------|
| `AgentChatThread` | `agent_chat_threads` | Contexto de página opcional |
| `AgentChatMessage` | `agent_chat_messages` | Parts JSON (AI SDK) |
| `AgentAttachment` | `agent_attachments` | Adjuntos en R2 |

## Enums relevantes

- `EntityType`: company, person, opportunity, activity, note, meeting
- `Role`: ADMIN, MEMBER
- `ProcessingStatus`: pending → extracting → transcribing → analyzing → ready | failed
- `ProposalStatus`: pending, approved, rejected, partially_approved, applied
- `CustomFieldType`: text, number, boolean, date, select, multiselect

## Reglas de negocio por entidad

### Organization

- `slug` único global.
- `integrationGatewaySecret` cifrado con `SETTINGS_ENCRYPTION_KEY`.
- `isActive=false` bloquea login de sus usuarios.

### Opportunity

- Siempre ligada a una `Company` y un `PipelineStage`.
- `status` string (ej. `open`); `lossReason` al perder.
- `createdById` + `createdVia` registran quién la creó y por qué canal.
- Índice en `nextStepDueDate` para crons de vencimiento.

### Trazabilidad de creación CRM core

- `Company`, `Person`, `Opportunity`, `Activity` y `Note` registran
  `createdById` nullable hacia `User`, `createdVia`, `createdAt` y `updatedAt`.
- Valores esperados de `createdVia`: `manual`, `agent`, `meeting`, `workflow`,
  `seed`, `legacy`.
- Para acciones vía agente/propuestas, `createdById` apunta al usuario humano
  que ejecutó o aplicó la acción; el canal queda en `createdVia`.
- Filas históricas sin autor quedan como `createdVia=legacy` y
  `createdById=null`.

### CRMChangeItem

Tipos conocidos: `stage_change`, `create_task`, `add_contact`, `link_contact`,
`update_pain`, `add_note`, `update_sponsor`, `update_decision_maker`,
`update_field`.

Estados: pending → approved/rejected → applied/failed/reverted.

`revertData` JSON permite deshacer cambios aplicados.

### Person dedup

- Lógica en `src/lib/crm/person-dedup.ts` y `src/lib/meeting-intelligence/dedup-items.ts`.
- `duplicateOfId` en items de tipo `link_contact`.

## Restricciones críticas

- `@@unique([organizationId, key])` en `PipelineStage`.
- `@@unique([organizationId, dedupeKey])` en `IntegrationDelivery`.
- `User.email` único global (no por org).
- ON DELETE: Restrict en org para entidades CRM; Cascade en hijos dependientes.

## Índices detectables

Ver `@@index` en `schema.prisma` — la mayoría compuestos con `organizationId`.

## RLS (Row Level Security)

- Migración: `20260708000000_enable_row_level_security`.
- Rol `crm_app` (NOBYPASSRLS) vía `TENANT_DATABASE_URL`.
- Políticas usan `current_setting('app.current_org_id')` seteado en transacción
  por `src/lib/tenant.ts`.
- Setup manual: `scripts/sql/setup-roles.sql`.

## Migraciones relevantes

| Migración | Cambio |
|-----------|--------|
| `init` | Esquema base |
| `meeting_intelligence` | Meetings, evidence, proposals |
| `agent_chat` | Threads y mensajes |
| `multi_tenant_foundation` | Refactor multi-tenant |
| `integration_deliveries` | Gateway |
| `enable_row_level_security` | RLS |
| `add_opportunity_traceability` | Trazabilidad de oportunidades |
| `core_creation_traceability` | Trazabilidad de creación CRM core |

## Qué no debe romperse

- Filtro `organizationId` en cliente tenant.
- Unicidad de `dedupeKey` en integraciones.
- Flujo de estados de `CRMChangeProposal` / `CRMChangeItem`.
- Tokens de invitación/reset solo como hash en DB.
- Separación system vs tenant en Prisma.
