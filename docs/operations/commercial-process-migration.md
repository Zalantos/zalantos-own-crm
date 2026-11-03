# Migración del proceso comercial (HU-CRM-02)

## Componentes

| Paso | Tipo | Cómo corre |
| --- | --- | --- |
| `20261103120000_commercial_process_structure` | Estructural (aditiva) | `prisma migrate deploy` |
| `20261103120100_commercial_process_backfill` | Backfill determinístico + validaciones | `prisma migrate deploy` (aborta y revierte si una validación falla) |
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
  visible en `/admin/workflows` (siguen activos).
- `TimelineEvent(type=legacy_migration)` por oportunidad transformada.
- Banderas en `Opportunity.migrationReview` (lista separada por comas),
  visibles en la ficha y en la lista con "Requieren revisión".

## Orden seguro de despliegue

1. Backup / snapshot de la base de producción.
2. Validación previa (solo lectura):
   `DATABASE_URL=<prod> npx tsx scripts/validate-commercial-process.ts > pre.txt`
3. Ensayo en una copia: restaurar el backup en una base efímera y correr
   `prisma migrate deploy` + `validate` + `backfill --dry-run`.
4. Configurar variables nuevas (`COMMERCIAL_EVENTS_SECRET`,
   `RUMBO_CALLBACK_SECRET`, opcional `INTEGRATIONS_ORGANIZATION_SLUG`).
5. Deploy (`npm run start` corre `prisma migrate deploy`).
6. Validación posterior + revisar banderas:
   `npx tsx scripts/validate-commercial-process.ts`
7. Backfill controlado por organización:
   `npx tsx scripts/backfill-commercial-process.ts --organization-id <id> --dry-run --output manifest.json`
   → revisar `action` y marcar `reviewed: true` → `--apply --input manifest.json`.
8. Revisar `/opportunities/list?review=1` y `/admin/workflows` con el equipo.
9. Programar el cron diario `POST /api/cron/commercial-follow-ups`.

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
