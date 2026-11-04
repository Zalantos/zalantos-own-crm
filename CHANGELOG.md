# Changelog

## Unreleased

- Preparación de despliegue del rediseño comercial: `npm run start` ya no
  aplica migraciones (paso explícito `npm run prisma:migrate:deploy`);
  migración `commercial_workflow_compat` (workflows "etapa = Ganado/Perdido/
  Congelado" → `status_changed`); compuertas de avance también al crear una
  oportunidad en una etapa avanzada (UI, lead, agente/MI); los workflows de
  etapa disparados por IA reciben id + key; el cron de vencidos no repite
  recordatorios de workflow; el backfill controlado no duplica leads activos.

- Rediseño del proceso comercial (HU-CRM-02): Prospección
  (`CommercialLead`: prospecto → contactado → lead), pipeline de 4 etapas
  operativas con compuertas de avance y estados `open/paused/won/lost`,
  historial de etapas, atribución comercial (`CommercialAttribution`,
  `Campaign`, UTM desde inbound), pipeline de alianzas sobre
  `CommercialPartner`, próxima mejor acción (reglas + IA bajo demanda),
  interacciones omnicanal, analítica por cohortes (`/analytics`), traspaso a
  Rumbo con confirmación explícita, herramientas nuevas del agente/MCP y
  workflows `status_changed`/`reactivation_due`. Migraciones
  `commercial_process_structure` (aditiva) y `commercial_process_backfill`
  (determinística, validada); backfill controlado
  `scripts/backfill-commercial-process.ts`. Ver
  `docs/operations/commercial-process-migration.md`.

- Oportunidades: responsable (`ownerId` → `User`) y motivo de pérdida como
  enum `LossReason` (combo en el formulario, filtros en la lista, agente y
  Meeting Intelligence). Migración `opportunity_owner_loss_reason`: el texto
  libre previo de `lossReason` pasa a `OTHER` y `ownerId` se rellena con
  `createdById`.

- Tablero Kanban de tareas en `/activities?view=board` (por hacer / en curso
  / bloqueada / hecha), con fecha planeada además de la fecha límite, quién
  hizo la tarea (`completedBy`, distinto del responsable) y motivo de bloqueo.
  Migración `activity_task_kanban_fields` remapea `status` existente
  (`pending`→`todo`, `completed`→`done`).
- Estandarización de documentación Zalantos (README, AGENTS, CLAUDE, docs/,
  templates/, PR template).
- Sync docs con Telegram copiloto, tool `confirm_pending_proposal`, campos
  display de `CRMChangeItem`, cron `process-entity-context` y test Observability.

## 0.1.0

- Versión inicial del CRM Zalantos (desarrollo activo).
