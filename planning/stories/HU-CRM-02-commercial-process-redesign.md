# HU-CRM-02 — Rediseño del proceso comercial

## Objetivo

Separar el proceso comercial en tres flujos conectados — Prospección
(prospecto → contactado → lead), Oportunidades (4 etapas operativas +
estados) y Alianzas — con atribución estructurada, próxima mejor acción,
analítica de funnel por cohortes y traspaso controlado a Rumbo, sin perder
datos históricos ni romper agente, MCP, Telegram, Meeting Intelligence ni
workflows.

## Diagnóstico del estado real (auditoría)

| Área | Estado previo | Decisión |
| --- | --- | --- |
| `PipelineStage` | Etapas configurables por org (`key` estable), 12 por defecto + `congelado` en prod. `isWon/isLost` como etapas del tablero. | Se conserva la configurabilidad. Se reutilizan filas e ids (`reunion_discovery`, `propuesta_principal`, `negociacion`), se agrega `calificada` y se retiran (`isActive=false`) las demás. Nunca se borran. |
| `Opportunity.status` | String `open/won/lost`, desacoplado de la etapa (había ganados con `status=open`). | `open/paused/won/lost` (+ `archived` solo para registros legacy retirados por el backfill controlado). La etapa conserva la última etapa comercial real. |
| Prospección | No existía: los prospectos eran oportunidades en `lead_identificado`/`primer_contacto`. | Nueva entidad `CommercialLead` con estados (sin tabla `Prospect`). |
| `InboundLead` | Bandeja con idempotencia `(org, source, externalId)`; conversión directa a oportunidad. | Se conserva. Se agrega atribución (UTM/campaña), incorporación a prospección y trazabilidad inbound → lead → oportunidad. |
| Atribución | `Company.source` / `Opportunity.source` texto libre. | Tabla `CommercialAttribution` (primer/último toque) compartida por inbound, lead y oportunidad; `Campaign` mínima. Los textos legacy se conservan. |
| Actividades | `Activity` con tareas (`todo/in_progress/blocked/done`) y actividades registradas (`occurredAt`). | Se reutiliza. Se agregan vínculos a lead y partner, tipos `whatsapp`/`linkedin` y registro manual de interacciones desde UI. |
| Próximo paso | `nextStep/nextStepDueDate` en Company y Opportunity. | Se reutilizan y se amplían (canal, contexto, tarea vinculada, `nextStepUpdatedAt`) en oportunidad, lead y partner. |
| Partners | `CommercialPartner` catálogo + asignaciones con snapshot de %. | Se amplía `CommercialPartner` con etapa/estado de alianza; no se duplican partners ni se toca la economía de ofertas. |
| Rumbo | No hay contrato ni integración en el repo. | Modelo `RumboHandoff` + payload versionado + despacho vía gateway + callback de confirmación. Nunca se simula éxito. |
| Workflows | Condición `stage` comparada contra id; la UI documentaba key. | El motor acepta id o key; nuevo evento `status_changed`; workflows con etapas retiradas quedan marcados con `configWarning` (no se desactivan en silencio). |
| Tests | `node:test` con fakes en memoria. | Se mantiene el patrón + suite de integración contra Postgres local y prueba de migración legacy. |

## Cambios de esquema (migraciones expansivas)

1. `20261103120000_commercial_process_structure` — estructural:
   `commercial_leads`, `commercial_attributions`, `campaigns`,
   `opportunity_stage_history`, `commercial_status_changes`,
   `commercial_partner_contacts`, `rumbo_handoffs`; columnas nuevas en
   `opportunities`, `commercial_partners`, `activities`, `notes`,
   `inbound_leads`, `workflows`. FKs, índices, CHECKs, índices únicos
   parciales y RLS `tenant_isolation`.
2. `20261103120100_commercial_process_backfill` — backfill determinístico e
   idempotente en SQL (ver estrategia).
3. Backfill controlado `scripts/backfill-commercial-process.ts`
   (`--dry-run` → manifiesto revisable → `--apply`) para oportunidades legacy
   en etapas de prospección.
4. Validación `scripts/validate-commercial-process.ts` (antes/después).

Retiro de compatibilidad legacy (fuera de alcance): eliminar etapas
retiradas sin uso, `Opportunity.source`, `Company.source` y el estado
`archived`.

## Estrategia de migración y backfill

- Etapas: se reutilizan las filas existentes por `key` (preserva ids usados
  en workflows y keys usadas en el historial de cambios IA); las faltantes se
  crean. Orden `reunion_discovery(0) → calificada(1) → propuesta_principal(2)
  → negociacion(3)`; las demás quedan retiradas detrás.
- Etapa `ganado/perdido` (o flags `isWon/isLost`) con `status=open` →
  `status=won/lost`; la fecha sólo se completa si existe un evento
  `stage_changed` que lo pruebe. `lost` sin motivo queda con `lossReason`
  nulo y `migrationReview` marcado.
- `congelado` → `status=paused`; la etapa previa se recupera del último
  `stage_changed` del timeline. Si no hay evidencia se conserva la etapa
  retirada y se marca `migrationReview=paused_previous_stage_unknown`.
- Etapas de diagnóstico (`dolor_validado`, `sprint_0_*`,
  `diagnostico_realizado`, `→ Discovery,
  conservando la semántica en `sprint0Status`.
- `propuesta_principal`: `proposalSentAt` sólo si hay oferta con `sentAt`;
  si no, `migrationReview=proposal_sent_unverified`.
- `lead_identificado`, `investigacion_realizada`, `primer_contacto`: el SQL
  no las mueve (quedan en etapas retiradas, fuera del tablero y visibles en
  "Requieren revisión"). El script controlado propone por oportunidad
  `convert_to_lead` (sin evidencia de proyecto) o `keep_as_opportunity`
  (ofertas, reuniones, monto o dolor registrados).
- `Opportunity.source` → `CommercialAttribution(method=migration)` con canal
  mapeado y el texto original en `sourceDetail`.
- Historial: una fila abierta de `opportunity_stage_history` por oportunidad
  con `enteredAt` sólo cuando hay evidencia; si no, `null`.
- Todo cambio de backfill deja un `TimelineEvent(type=legacy_migration)` con
  etapa/estado previos. Duplicados (empresa + nombre normalizado) sólo se
  reportan.

## Componentes y rutas afectados

- Nuevas rutas: `/prospecting`, `/prospecting/new`, `/prospecting/[id]`,
  `/partners`, `/partners/[id]`, `/analytics`, `/admin/settings/campaigns`,
  `POST /api/integrations/activities`,
  `POST /api/integrations/rumbo/handoff-status`,
  `POST /api/cron/commercial-follow-ups`.
- Modificadas: `/opportunities` (Kanban 4 etapas, columnas de ancho fijo),
  `/opportunities/list` (orden, búsqueda, estados), `/opportunities/[id]`
  (próxima mejor acción, seguimiento, SPICED, estados, Rumbo), `/leads`,
  `/activities`, `/dashboard`, `/admin/workflows`, navegación.
- Lógica: `src/lib/commercial/*` (servicios puros por tenant), `apply.ts`
  (tipos de ítem nuevos y reversibles), tools del agente/MCP, motor de
  workflows, cron `check-overdue`, ingest inbound.

## Dependencias

Schema → servicios de dominio → acciones/UI → apply engine/agente/MCP →
workflows/crons/integraciones → tests → docs.

## Riesgos

- Workflows con condiciones sobre etapas retiradas dejan de dispararse:
  mitigado con `configWarning` visible y documentado.
- Clientes del agente/n8n que usen keys retiradas (`ganado`, `perdido`):
  adaptador que traduce a cambio de estado con mensaje explícito.
- Oportunidades legacy de prospección quedan fuera del tablero hasta correr
  el backfill controlado: visibles en la lista con filtro "Requieren revisión".
- Métricas históricas con fechas desconocidas: se excluyen de tiempos
  promedio y se informa el tamaño de muestra.

## Criterios de aceptación

Ver sección 22 del requerimiento; escenarios A–H cubiertos por
`src/lib/commercial/*.test.ts` y `scripts/test-commercial-migration.ts`.

## Checklist técnico

- [x] BD / modelos Prisma, migraciones estructural + backfill, RLS
- [x] Backend / servicios de dominio, validaciones de etapa y estado
- [x] Frontend / prospección, oportunidades, alianzas, actividades, analítica
- [x] Agente / MCP / Telegram / Meeting Intelligence
- [x] Workflows, crons, inbound, Rumbo
- [x] Tests unitarios, integración y migración legacy
- [x] Lint, typecheck y build
- [x] Documentación

## Evidencia (2026-11-03, entorno local; nada se ejecutó contra Railway)

- `npx prisma validate`: OK. `prisma migrate diff` (base migrada vs schema): sin diferencias.
- `scripts/check-rls-coverage.ts`: 46 tablas tenant con RLS + política.
- `npm run test:commercial-migration` (escenario H): 15 oportunidades legacy
  migradas sin pérdida, 11 eventos de trazabilidad, backfill idempotente.
- Backfill controlado sobre el fixture: dry-run 2 (1 convert_to_lead, 1
  keep_as_opportunity); apply 1/1; segunda corrida 2 omitidas.
- `npm run test:commercial-integration` (A–G, Postgres local con rol
  `crm_app` y RLS): 7/7.
- Unit: commercial-process 23/23, inbound-leads 22/22, mcp-tools 39/39,
  contact-dedup 12/12, commercial 8/8, observability 3/3.
- `tsc --noEmit`: OK. `npm run lint`: 0 errores (1 warning preexistente en
  `web-search.ts`). `npm run build`: OK.
- Smoke test `next start` contra base sembrada: 20 rutas 200 sin errores;
  `/api/integrations/activities` 201/200 duplicado/401/202 unmatched.
- Pendiente: pruebas de UI en navegador (no hay Playwright en el repo),
  conectores M365/WhatsApp y contrato de Rumbo (externos).
