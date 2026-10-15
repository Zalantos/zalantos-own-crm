# Modelo de datos — CRM Zalantos

Fuente de verdad: `prisma/schema.prisma`.

## Entidades principales

### Multi-tenancy y auth

| Modelo               | Tabla                   | Descripción                                                   |
| -------------------- | ----------------------- | ------------------------------------------------------------- |
| `Organization`       | `organizations`         | Tenant; settings inline (moneda, timezone, branding, gateway) |
| `User`               | `users`                 | Usuario; `organizationId` nullable solo para super-admins     |
| `Invitation`         | `invitations`           | Invitaciones por email con token hasheado                     |
| `PasswordResetToken` | `password_reset_tokens` | Reset de contraseña                                           |
| `TeamMember`         | `team_members`          | Catálogo de asignables a tareas (vínculo opcional a User)     |
| `PipelineStage`      | `pipeline_stages`       | Etapas del pipeline por org (`key` estable)                   |

### CRM core

| Modelo                      | Tabla                          | Relaciones clave                                                  |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `Company`                   | `companies`                    | → opportunities, relaciones de personas, partners, reuniones      |
| `Person`                    | `people`                       | → empresas N:M; roles en opportunities                            |
| `Opportunity`               | `opportunities`                | → company, stage, decisionMaker, sponsor                          |
| `PersonCompanyRelationship` | `person_company_relationships` | N:M persona–empresa con roles, cargo y principal                  |
| `Activity`                  | `activities`                   | → company/person/opportunity, assignee y completedBy (TeamMember) |
| `ActivityPerson`            | `activity_people`              | Personas que participaron de una actividad registrada (N:M)       |
| `Note`                      | `notes`                        | → company/person/opportunity                                      |
| `InboundLead`               | `inbound_leads`                | Bandeja previa a Company/Person/Opportunity; ver sección propia   |

### Partners y ofertas comerciales

| Modelo                         | Tabla                             | Notas                                      |
| ------------------------------ | --------------------------------- | ------------------------------------------ |
| `CommercialPartner`            | `commercial_partners`             | Catálogo tenant; empresa/persona/externo   |
| `CompanyCommercialPartner`     | `company_commercial_partners`     | Acuerdo habitual y porcentaje por defecto  |
| `OpportunityCommercialPartner` | `opportunity_commercial_partners` | Snapshot del partner para un negocio       |
| `CommercialOffer`              | `commercial_offers`               | Oferta versionada y economía proyectada    |
| `CommercialOfferLineItem`      | `commercial_offer_line_items`     | Implementación, hitos, mensualidad u otros |
| `CommercialOfferDocument`      | `commercial_offer_documents`      | URL o fuente de contexto asociada          |
| `CommercialOfferProfitShare`   | `commercial_offer_profit_shares`  | Reparto de la utilidad, no del costo       |
| `BusinessHoliday`              | `business_holidays`               | Feriados excluidos de la vigencia hábil    |

### Extensibilidad

| Modelo                  | Tabla                      | Notas                        |
| ----------------------- | -------------------------- | ---------------------------- |
| `CustomFieldDefinition` | `custom_field_definitions` | Por `EntityType`             |
| `CustomFieldValue`      | `custom_field_values`      | Valores tipados              |
| `SavedView`             | `saved_views`              | Filtros/columnas por entidad |

### Automatización

| Modelo                | Tabla                    | Notas                                       |
| --------------------- | ------------------------ | ------------------------------------------- |
| `Workflow`            | `workflows`              | trigger + conditions + actions en JSON      |
| `WorkflowLog`         | `workflow_logs`          | Auditoría de ejecución                      |
| `IntegrationDelivery` | `integration_deliveries` | Cola de despacho al gateway; dedupe por org |

### Meeting Intelligence

| Modelo              | Tabla                  | Notas                                           |
| ------------------- | ---------------------- | ----------------------------------------------- |
| `Meeting`           | `meetings`             | `processingStatus` enum; evidencia y propuestas |
| `Evidence`          | `evidence`             | Archivos en R2; `extractedText`                 |
| `CRMChangeProposal` | `crm_change_proposals` | Lote/bitácora IA, canal e iniciador             |
| `CRMChangeItem`     | `crm_change_items`     | Cambios atómicos aplicables y reversibles       |
| `TimelineEvent`     | `timeline_events`      | Historial por empresa                           |

### Agente IA

| Modelo             | Tabla                 | Notas                       |
| ------------------ | --------------------- | --------------------------- |
| `AgentChatThread`  | `agent_chat_threads`  | Contexto de página opcional |
| `AgentChatMessage` | `agent_chat_messages` | Parts JSON (AI SDK)         |
| `AgentAttachment`  | `agent_attachments`   | Adjuntos en R2              |

### Telegram (canal copiloto)

| Modelo             | Tabla                 | Notas                                                                      |
| ------------------ | --------------------- | -------------------------------------------------------------------------- |
| `TelegramLink`     | `telegram_links`      | `telegramChatId` único → `userId` + `organizationId`; `agentThreadId` lazy |
| `TelegramLinkCode` | `telegram_link_codes` | Código de 6 chars, TTL corto, un solo uso                                  |
| `McpAccessToken`   | `mcp_access_tokens`   | Token personal hasheado; thread de propuestas MCP creado lazy              |

Ambas con RLS `tenant_isolation`. Resolución de vínculo en APIs Telegram usa
`prismaSystem` (sin sesión web). Soft-delete: `TelegramLink.isActive=false`.

`McpAccessToken` también usa RLS `tenant_isolation`. El secreto `zcrm_…` se
muestra una sola vez y nunca se persiste: solo se guarda su hash SHA-256 y un
prefijo visible. El lookup del Bearer usa `prismaSystem`; una vez resueltos
usuario y organización, las tools operan con `forOrg(organizationId)`.

### Enriquecimiento de contexto

| Modelo                 | Tabla                     | Notas                                                                      |
| ---------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `EntityContextSource`  | `entity_context_sources`  | Documento/fuente ligada a company/person/opportunity; R2 + `extractedText` |
| `EntityContextProfile` | `entity_context_profiles` | Perfil IA consolidado (summary, keyFacts, topics); unique por entidad      |

## Enums relevantes

- `EntityType`: company, person, opportunity, activity, note, meeting
- `Role`: ADMIN, MEMBER
- `ProcessingStatus`: pending → extracting → transcribing → analyzing → ready | failed
- `ProposalStatus`: pending, applying, approved, rejected, partially_approved,
  applied, partially_applied, failed, partially_reverted, reverted
- `CustomFieldType`: text, number, boolean, date, select, multiselect

## Reglas de negocio por entidad

### Organization

- `slug` único global.
- `integrationGatewaySecret` cifrado con `SETTINGS_ENCRYPTION_KEY`.
- `isActive=false` bloquea login de sus usuarios.

### Company

- Perfil comercial estándar editable manualmente y vía propuestas IA:
  `source`, `priority`, `mainPain`, `productInterest`, `potentialValue`,
  `buyingTiming`, `urgency`, `competitor`, `currentProvider`, `nextStep`,
  `nextStepDueDate`, `lastContactAt`.
- Estos campos viven en `Company` para aparecer en el dashboard/detalle de
  empresa aunque no exista una oportunidad abierta.
- Enriquecimiento IA aplica estos campos inmediatamente y registra el lote en
  `CRMChangeProposal(source=enrichment, channel=enrichment)`.

### Opportunity

- Siempre ligada a una `Company` y un `PipelineStage`.
- `status` string (ej. `open`); `lossReason` (enum `LossReason`: PRICE,
  CHOSE_COMPETITOR, NO_BUDGET, DEPRIORITIZED, SOLVED_INTERNALLY,
  CONTACT_OR_ORG_CHANGE, NO_RESPONSE, NOT_QUALIFIED, OTHER) obligatorio al
  perder y limpiado en otros estados.
- `ownerId` → `User` (responsable, `onDelete: SetNull`); por defecto el
  creador. Distinto de `createdById`, que es solo trazabilidad.
- Ocultar etapas en lista y tablero es preferencia del navegador (cookie
  `opportunity-hidden-stages`), no un campo de la oportunidad. Un filtro
  explícito de etapa en la lista sigue mostrando esa etapa.
- `createdById` + `createdVia` registran quién la creó y por qué canal.
- Índice en `nextStepDueDate` para crons de vencimiento.
- `estimatedValue` sigue alimentando el embudo existente; la oferta comercial
  no lo reemplaza automáticamente.

### Personas multiempresa

- `PersonCompanyRelationship` es la fuente nueva para empresas, roles y cargo
  por relación. Solo puede existir una relación principal activa por persona.
- `Person.companyId` y `Person.roleTitle` se mantienen temporalmente como espejo
  de la relación principal para compatibilidad. Las escrituras manuales,
  inbound y de Meeting Intelligence crean/sincronizan las relaciones.
- El email sigue siendo único por organización. El match alternativo por nombre
  se evalúa contra cualquiera de las empresas activas relacionadas.
- La migración es expansiva: crea la relación principal desde los campos legacy
  y relaciones secundarias cuando decisor/sponsor ya participa en una
  oportunidad de otra empresa. Retirar los campos legacy queda para otra HU.

### Partners, ofertas y economía

- El porcentaje configurado en empresa se copia al asignar el partner a una
  oportunidad; cambios posteriores no alteran el negocio histórico.
- Cada versión de `CommercialOffer` conserva sus partidas, documentos y
  snapshots de reparto. Una oferta emitida no se edita: se clona una nueva
  versión y la anterior pasa a `superseded` cuando corresponde.
- Los montos económicos son netos y usan la unidad de la oferta. Invariante:
  `economicBaseNetAmount = projectCostAmount + distributableProfitAmount`.
- El reparto se calcula exclusivamente sobre `distributableProfitAmount`, debe
  tener una fila de organización y porcentajes que sumen exactamente 100%.
- Las ofertas sin costo histórico conocido pueden conservar el precio neto con
  costo/utilidad nulos. No representan facturas, cobros ni pagos reales.
- Reportes muestran la unidad original; no suman UF, CLP y USD entre sí. El
  tipo de cambio a CLP es un snapshot opcional de la versión.
- La vigencia hábil excluye sábados, domingos y `BusinessHoliday`. El caso
  06-10-2026 + 15 días hábiles con feriado 12-10-2026 vence 28-10-2026.

### Trazabilidad de creación CRM core

- `Company`, `Person`, `Opportunity`, `Activity` y `Note` registran
  `createdById` nullable hacia `User`, `createdVia`, `createdAt` y `updatedAt`.
- Valores esperados de `createdVia`: `manual`, `agent`, `meeting`, `enrichment`,
  `workflow`, `inbound_lead`, `seed`, `legacy`.
- Para acciones vía agente/propuestas, `createdById` apunta al usuario humano
  que ejecutó o aplicó la acción; el canal queda en `createdVia`.
- Filas históricas sin autor quedan como `createdVia=legacy` y
  `createdById=null`.

### CRMChangeItem

Tipos conocidos: `stage_change`, `create_task`, `add_contact`, `link_contact`,
`update_pain`, `add_note`, `update_sponsor`, `update_decision_maker`,
`update_field`, `log_activity`, `create_meeting`, `update_task`, `update_note`,
`update_activity`, `update_meeting`.

Estados: pending → approved/rejected → applied/failed/reverted.

`CRMChangeProposal` agrupa un turno o análisis y guarda `channel`
(`web|telegram|mcp|meeting|enrichment|legacy`), `initiatedBy` y `completedAt`.
Cada `CRMChangeItem` guarda orden, si requiere aprobación, `beforeValue`,
snapshot posterior canónico, error estructurado, datos de reversión, vencimiento
y usuario que revirtió. `causedByItemId` enlaza efectos internos de workflows.

Las mutaciones no destructivas se aplican inmediatamente, incluso con confianza
menor a `0.8`; estas últimas se destacan como “requiere atención”. Borrar o
fusionar datos requiere aprobación previa. Cada ítem se aplica en su propia
transacción para permitir lotes parcialmente aplicados.

`revertData` permite deshacer durante 90 días. Antes de restaurar se comparan
los campos afectados con `appliedSnapshot`; las creaciones sólo se eliminan si
siguen intactas y no tienen dependencias ajenas. La reversión grupal prevalida
todo el lote y ejecuta los ítems en orden inverso.

Campos de presentación (migración `change_item_display_strings`): `label`,
`before`, `after` — cadenas legibles persistidas al crear la propuesta para
renderizar cards de revisión (`/agent/proposals`) con paridad al chat. Nullable
en propuestas anteriores a la migración.

### Entity context enrichment

- `EntityContextSource.sourceType`: `upload` | `linkedin` | `url` | `manual` |
  `agent` (string extensible; LinkedIn es adapter futuro de ingesta).
- `EntityContextSource.status`: `uploaded` → `extracting` → `extracted` →
  `analyzing` → `ready` | `failed`.
- `CRMChangeProposal.source` admite `enrichment`; refs lógicas
  `contextSourceId` y `personId`.
- Política: perfil y salidas derivadas no forman parte de la bitácora reversible;
  los campos operativos CRM se aplican y registran de inmediato.

### Activity (tablero Kanban de tareas)

- `status` string libre (no enum de Prisma, mismo criterio que `Opportunity.status`),
  con 4 valores usados por el tablero en `/activities?view=board`: `todo`
  (Por hacer), `in_progress` (En curso), `blocked` (Bloqueada), `done` (Hecha).
  Constante única en `src/lib/activity-status.ts`.
- `plannedDate` (cuándo se planea trabajar la tarea) es distinto de `dueDate`
  (vencimiento/compromiso). El cron `send-task-reminders` usa las dos a las
  18:00 (timezone de la org): entran las abiertas planeadas para ese día o con
  `dueDate` de hoy o anterior. El aviso las llama vencidas; no escribe
  `status` ni `dueDate`.
- `completedById` → `TeamMember` (relación `ActivityCompletedBy`, separada de
  `assigneeId`/`ActivityAssignee`): quién hizo la tarea. Se autocompleta con
  el responsable actual al mover a `done`, pero es editable/limpiable; no se
  backfillea para tareas `done` previas a esta migración (quedan sin
  registrar en vez de asumir que las completó el responsable).
- `blockedReason` (texto libre) solo tiene sentido mientras `status="blocked"`;
  se limpia automáticamente al salir de ese estado.
- `statusChangedAt` se actualiza en cada cambio de estado (vía
  `updateActivityStatus` en `activities/actions.ts`), que además dispara un
  evento de timeline (`task_status_changed`) y `evaluateWorkflows` con
  `entityType: "activity", eventName: "status_changed"`.
- `priority` (`low` | `medium` | `high`, nullable; constante en
  `src/lib/activity-priority.ts`) aplica a tareas.
- **Actividades registradas** (`occurredAt` no nulo): algo que ya ocurrió
  (llamada, email, visita, reunión breve) cargado con la tool `create_activity`.
  Nacen con `status="done"` y `completedAt=occurredAt`, así que no aparecen en
  tareas abiertas, agenda ni recordatorios; sí en el tablero, en la columna
  "Hecha". Guardan `durationMinutes`, `channel`, `outcomes` y `description`
  (resumen). `personId` es la persona principal; todas las personas van en
  `ActivityPerson`. Al crearse, adelantan `Company.lastContactAt` si la fecha
  es más nueva y no futura, y escriben un evento `activity_logged` en el
  timeline con `occurredAt` igual a la fecha de la actividad. `list_tasks` y
  `update_task` las excluyen (`occurredAt: null`). Lógica compartida en
  `src/lib/crm/activity-records.ts`.

### Meeting manual

- Una reunión sin grabación (tool `create_meeting`) se guarda con
  `sourceType="manual"`, `processingStatus="ready"`, sin `rawTranscript`, y con
  `aiSummary` en el mismo formato que produce el pipeline (`headline`,
  `keyPoints`, `decisions`, `risks`) más `nextSteps` y `source: "manual"`.
  `participants` admite `{ name, email?, company?, role?, internal? }`.

### Person dedup

- Lógica en `src/lib/crm/person-dedup.ts` y `src/lib/meeting-intelligence/dedup-items.ts`.
- `duplicateOfId` en items de tipo `link_contact`.
- El email se persiste normalizado (`trim` + minúsculas; vacío → `null`) y es
  único por organización mediante `@@unique([organizationId, email])`.
- Sin email, el match alternativo es nombre+apellido exactos, sin distinguir
  mayúsculas, dentro de la misma empresa.
- `CRMChangeProposal.applyStartedAt` implementa el lease del estado `applying`
  para evitar aplicaciones concurrentes y permitir reintentos tras un crash.
- `CRMChangeItem.undoExpiresAt` vence 90 días después de `appliedAt`; la fila se
  conserva indefinidamente aunque ya no pueda deshacerse.

### Inbound Leads

- Documentación completa: `docs/integrations/inbound-leads.md`.
- `InboundLead` es una bandeja de revisión previa: el POST de ingesta
  (`source` + `externalId`) **nunca** crea `Company`/`Person`/`Opportunity`
  directamente; eso solo ocurre en la conversión manual desde `/leads`.
- `status`: `new` → `reviewed` | `converted` | `rejected` (string, mismo
  criterio que `Opportunity.status`). Abrir el detalle no cambia el estado;
  requiere una acción explícita.
- Idempotencia del canal entrante: `@@unique([organizationId, source,
externalId])`. El ingest hace `create` directo y resuelve el conflicto
  (P2002) con un lookup — no un `findFirst` previo, que sería vulnerable a
  condiciones de carrera con reintentos concurrentes de n8n.
- La conversión reutiliza `findExistingPerson` (mismo dedup que el resto del
  CRM) y dos entidades ya existentes pero antes no exportadas: el helper
  queda en `lib/inbound-leads/convert.ts` para poder testearlo sin DB real
  (mismo patrón que `meeting-intelligence/apply.ts`).
- Entidades creadas en la conversión llevan `createdVia: "inbound_lead"`
  (agregado a los valores esperados de `createdVia`).

## Restricciones críticas

- `@@unique([organizationId, key])` en `PipelineStage`.
- `@@unique([organizationId, email])` en `Person` (los `NULL` no colisionan).
- `@@unique([organizationId, dedupeKey])` en `IntegrationDelivery`.
- `@@unique([organizationId, source, externalId])` en `InboundLead`.
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

| Migración                              | Cambio                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                                 | Esquema base                                                                                                                                                          |
| `meeting_intelligence`                 | Meetings, evidence, proposals                                                                                                                                         |
| `agent_chat`                           | Threads y mensajes                                                                                                                                                    |
| `multi_tenant_foundation`              | Refactor multi-tenant                                                                                                                                                 |
| `integration_deliveries`               | Gateway                                                                                                                                                               |
| `enable_row_level_security`            | RLS                                                                                                                                                                   |
| `add_opportunity_traceability`         | Trazabilidad de oportunidades                                                                                                                                         |
| `entity_context_enrichment`            | Sources + perfil IA + campos proposal enrichment                                                                                                                      |
| `core_creation_traceability`           | Trazabilidad de creación CRM core                                                                                                                                     |
| `add_telegram_link`                    | `telegram_links` + `telegram_link_codes`                                                                                                                              |
| `change_item_display_strings`          | `label` / `before` / `after` en `crm_change_items`                                                                                                                    |
| `activity_task_kanban_fields`          | Tablero Kanban de tareas: `plannedDate`, `completedById`, `blockedReason`, `statusChangedAt` en `activities`; remapea `status` (`pending`→`todo`, `completed`→`done`) |
| `person_dedup_and_proposal_apply_lock` | Normaliza identidad de personas, hace único el email por organización y agrega el lease `applying` a propuestas                                                       |
| `add_mcp_access_token`                 | Tokens personales MCP con revocación, último uso, thread lazy y RLS                                                                                                   |
| `inbound_leads`                        | Modelo `InboundLead` (bandeja `/leads`) con idempotencia por `(organizationId, source, externalId)`                                                                   |
| `inbound_leads_rls`                    | RLS `tenant_isolation` sobre `inbound_leads` (separada porque la migración base de RLS ya está desplegada)                                                            |
| `logged_activities_and_task_priority`  | Aditiva: `priority`, `occurredAt`, `durationMinutes`, `channel`, `outcomes` en `activities`; tabla `activity_people` con RLS                                          |
| `ai_change_traceability`               | Canal/iniciador/fin de lote, snapshots, errores, expiración de reversión y relación de efectos internos; estados parciales/fallidos/revertidos                        |
| `commercial_data_partners`             | Relaciones persona–empresa N:M, catálogo/asignación de partners, ofertas versionadas, reparto de utilidad, feriados, backfill legacy y RLS                            |

## Qué no debe romperse

- Filtro `organizationId` en cliente tenant.
- Unicidad de `dedupeKey` en integraciones.
- Flujo de estados de `CRMChangeProposal` / `CRMChangeItem`.
- Tokens de invitación/reset solo como hash en DB.
- Separación system vs tenant en Prisma.
- Unicidad de `TelegramLink.telegramChatId` y resolución tenant vía vínculo.
- Unicidad de `(organizationId, source, externalId)` en `InboundLead` y el
  invariante de que el ingest nunca crea Company/Person/Opportunity directo.
- Una sola relación principal activa por persona; versiones de oferta únicas
  por oportunidad y fingerprint de backfill único por organización.
