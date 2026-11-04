# Migración del proceso comercial (HU-CRM-02)

## Componentes

| Paso | Tipo | Cómo corre |
| --- | --- | --- |
| `20261103120000_commercial_process_structure` | Estructural (aditiva) | `prisma migrate deploy` |
| `20261103120100_commercial_process_backfill` | Backfill determinístico + validaciones | `prisma migrate deploy` (aborta y revierte si una validación falla) |
| `20261104120000_commercial_workflow_compat` | Reescribe workflows con equivalencia exacta (etapa Ganado/Perdido/Congelado → `status_changed` + estado) | `prisma migrate deploy` (una sola sentencia, idempotente) |
| `scripts/backfill-commercial-process.ts` | Backfill controlado de prospección | Manual: dry-run → revisión → apply |
| `scripts/validate-commercial-process.ts` | Validación de solo lectura | Antes y después |

Retiro de compatibilidad (futuro, otra HU): borrar etapas retiradas sin
oportunidades, `Opportunity.source`, `Company.source`, estado `archived`.

## Qué transforma el backfill SQL

- Etapas: reutiliza `reunion_discovery` (→ "Discovery / Sprint 0"),
  `propuesta_principal` (→ "Propuesta enviada"), `negociacion`; crea
  `calificada` si falta; el resto queda `isActive=false` (no se borra).
- `ganado`/`isWon` con `status=open` → `won`; `perdido`/`isLost` → `lost`
  (sin motivo → bandera `lost_without_reason`). `wonAt`/`lostAt` solo con un
  `stage_changed` del timeline que lo pruebe.
- `congelado` → `paused`, recuperando la etapa previa desde el timeline (si
  no hay evidencia queda en la etapa retirada con
  `paused_previous_stage_unknown`).
- `dolor_validado`, `sprint_0_*`, `diagnostico_realizado` → Discovery con
  `sprint0Status` (`offered`, `accepted`, `done`), sin fechas.
- `propuesta_principal`: `proposalSentAt` solo desde ofertas con `sentAt`; si
  no, `proposal_sent_unverified`.
- Prospección legacy (`lead_identificado`, `investigacion_realizada`,
  `primer_contacto`): **no** se mueven; `pending_prospecting_backfill`.
- `Opportunity.source` → atribución `method=migration` (texto original en
  `sourceDetail`).
- Historial de etapas inicial por oportunidad (`enteredAt` solo con evidencia).
- Workflows cuyas condiciones usan etapas retiradas → `configWarning`
  visible en `/admin/workflows` (siguen activos). Los que solo condicionan
  "etapa = Ganado / Perdido / Congelado" (eq o changed_to) se reescriben en
  `20261104120000_commercial_workflow_compat` a `status_changed` +
  `estado = won / lost / paused`, con advertencia "Migrado automáticamente".
  Las condiciones sobre etapas de diagnóstico o prospección no tienen
  equivalencia exacta: no se reescriben y no se disparan (ninguna
  oportunidad vuelve a entrar en una etapa retirada).
- `TimelineEvent(type=legacy_migration)` por oportunidad transformada.
- Banderas en `Opportunity.migrationReview` (lista separada por comas),
  visibles en la ficha y en la lista con "Requieren revisión".

## Orden seguro de despliegue (Railway)

`npm run start` ya **no** aplica migraciones (`next start`): se aplican como
paso explícito y controlado.

> Los commits del rediseño ya están en `origin/main`. Si el servicio de
> Railway despliega automáticamente `main` con el `start` anterior
> (`prisma migrate deploy && next start`), las dos primeras migraciones
> pueden haberse aplicado ya. Verificalo en el paso 2 antes de seguir.

1. **Backup**: snapshot / backup de la base de producción en Railway.
2. **Estado** (solo lectura):
   `railway run npm run prisma:migrate:status` → lista qué migraciones
   faltan. `railway run npx tsx scripts/validate-commercial-process.ts > pre.txt`.
3. **Ensayo** (recomendado): restaurar el backup en una base local o
   efímera y correr `prisma migrate deploy` + `validate` + `backfill --dry-run`
   sobre ella (nunca contra producción).
4. **Variables**: no hay variables nuevas obligatorias (ver
   `docs/operations/env-vars.md`; `COMMERCIAL_EVENTS_SECRET`,
   `RUMBO_CALLBACK_SECRET` e `INTEGRATIONS_ORGANIZATION_SLUG` son opcionales).
5. **Migrar**: `railway run npm run prisma:migrate:deploy` (aplica
   `structure` → `backfill` → `workflow_compat` en orden; el backfill aborta
   y revierte si una validación falla).
6. **Desplegar el código** (push / redeploy del servicio). El start ya no
   migra.
7. **Validación posterior**: `railway run npx tsx scripts/validate-commercial-process.ts`
   y revisar banderas.
8. **Backfill controlado** por organización (solo oportunidades con
   `pending_prospecting_backfill`):
   `railway run npx tsx scripts/backfill-commercial-process.ts --organization-id <id> --dry-run --output manifest.json`
   → revisar `action` y marcar `reviewed: true` → `--apply --input manifest.json`.
   Es idempotente; si el contacto ya tiene un lead activo, la entrada se omite
   con un aviso para resolverla a mano.
9. Revisar `/opportunities/list?review=1` y `/admin/workflows` con el equipo.
10. **Cron comercial** diario (además de los existentes):
    `POST https://<APP_URL>/api/cron/commercial-follow-ups` con
    `Authorization: Bearer $CRON_SECRET` (Railway Cron, n8n o scheduler
    externo; p. ej. 08:00 hora local). Idempotente: una tarea por oportunidad
    pausada y fecha de reactivación.

## Rollback

Las migraciones son aditivas: el código previo ignora las columnas nuevas,
pero **las etapas retiradas y los estados `paused/won/lost` migrados sí
cambian lo que ve el código previo**. Para volver atrás sin pérdida: restaurar
el snapshot del paso 1 (recomendado) o reactivar etapas con
`UPDATE pipeline_stages SET "isActive" = true` y usar `legacyStageKey` para
reubicar oportunidades.

## Pruebas

- `MIGRATION_TEST_DATABASE_URL=postgresql://localhost/<db> npm run test:commercial-migration`
  aplica todas las migraciones previas sobre una base local efímera, carga
  `scripts/sql/test-fixtures/commercial-legacy.sql`, migra, valida y
  re-ejecuta el backfill (idempotencia). **Borra el schema `public`**: solo
  localhost.

## Simplificación comercial (actores, alertas, retiro de Meeting Intelligence)

Pasos al desplegar:

1. Respaldar la base y ejecutar `npm run prisma:migrate:deploy`. Aplica
   `commercial_actors_and_alerts` y `commercial_actors_alerts_backfill`; ambas son
   aditivas e idempotentes.
2. Quitar del scheduler el cron `/api/cron/process-evidence`, que ya no existe.
3. Programar `/api/cron/commercial-follow-ups` cada hora.
4. Revisar las reglas en `/admin/settings/alerts` **antes** de la primera corrida:
   detecta todos los registros que ya cumplen una condición y, con gateway
   configurado, envía un email por alerta. Para evitarlo, desactiva reglas o ajusta
   umbrales primero.

Rollback: las tablas nuevas pueden quedar sin uso; no se eliminó ningún dato.
