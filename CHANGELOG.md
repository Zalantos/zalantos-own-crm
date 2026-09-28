# Changelog

## Unreleased

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
