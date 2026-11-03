# Proceso comercial — CRM Zalantos

Rediseño HU-CRM-02 (ver `planning/stories/HU-CRM-02-commercial-process-redesign.md`).
Tres procesos conectados: **Prospección**, **Oportunidades** y **Alianzas**.
El trabajo comercial vive en el CRM hasta el compromiso formal; la ejecución
del proyecto vive en **Rumbo**.

## Conceptos

| Concepto | Qué es | Dónde vive |
| --- | --- | --- |
| Empresa / Persona | Directorio. No es automáticamente un prospecto ni un lead. | `Company`, `Person` |
| Prospecto | Empresa o persona potencialmente interesante. Sin interés demostrado. | `CommercialLead(status=prospect)` |
| Contactado | Se hizo un **intento** de contacto (email, WhatsApp, llamada, LinkedIn…). No es una respuesta positiva. | `CommercialLead(status=contacted)` |
| Lead | Manifestó interés o hay una necesidad reconocible (`interestSignal`). | `CommercialLead(status=lead)` |
| Oportunidad | Proyecto o necesidad concreta que Zalantos puede abordar. Una empresa o un lead pueden tener varias. | `Opportunity` |
| Alianza | Relación con un partner que genera referidos y oportunidades. No es una venta. | `CommercialPartner.alliance*` |
| Lead entrante | Bandeja de recepción de formularios externos, previa a la revisión humana. | `InboundLead` (`/leads`) |

## Prospección (`/prospecting`)

`prospect → contacted → lead → converted`, más `disqualified` (con motivo,
reabrible). Reglas (`src/lib/commercial/leads.ts`):

- **Contactado** exige evidencia: un intento registrado (se crea una
  interacción) o una interacción ya existente del lead.
- **Lead** exige `interestSignal`.
- **Convertido** solo al crear una oportunidad (`convertLeadToOpportunity`):
  entra en Discovery / Sprint 0, `commercialLeadId` y el **mismo**
  `firstTouchAttributionId` del lead. Un lead puede originar más
  oportunidades.
- Fechas reales: `identifiedAt`, `firstContactAt`, `becameLeadAt`,
  `convertedAt`, `lastInteractionAt`; cada cambio queda en
  `CommercialStatusChange`.
- Dedupe: un solo lead activo por persona (o por empresa sin persona),
  serializado con `pg_advisory_xact_lock`. Empresa/persona se reutilizan con
  el dedup estándar del CRM (email, nombre+apellido en la empresa).

## Pipeline de oportunidades

Etapas configurables por organización (`PipelineStage`); las cuatro
operativas usan keys estables heredadas:

| Key | Etiqueta | Requisito obligatorio para **entrar** |
| --- | --- | --- |
| `reunion_discovery` | Discovery / Sprint 0 | — |
| `calificada` | Calificada | Pain (`mainPain`) registrado |
| `propuesta_principal` | Propuesta enviada | Decisión explícita (`proposalDecisionAt`) **y** envío real (`proposalSentAt` u oferta con `sentAt`) |
| `negociacion` | Negociación | Interacción (actividad ocurrida o reunión) posterior al envío |

- Retroceder no exige requisitos; saltar etapas acumula los de las
  intermedias. Etapas custom de la org no tienen compuertas.
- SPICED (`situation`, `mainPain`, `impact`, `criticalEvent`,
  `decisionProcess`) es **deseable**: se muestra como checklist, solo Pain
  bloquea.
- Sprint 0 se mide con `sprint0Status`, `sprint0ScheduledAt`,
  `sprint0CompletedAt`, `diagnosisDeliveredAt` (sin etapas extra).
- Alias aceptados (agente/n8n): `discovery`, `propuesta_enviada`,
  `negotiation`… (`STAGE_KEY_ALIASES`). Keys legacy terminales o de
  prospección devuelven la acción correcta (`LEGACY_STAGE_ACTIONS`).
- El tablero (`/opportunities`) muestra solo `status=open` en etapas activas
  no terminales; columnas de ancho fijo con scroll horizontal propio.

### Estados (`src/lib/opportunities/status.ts`)

| Estado | Regla | Efecto |
| --- | --- | --- |
| `open` | Requiere responsable y etapa activa. Reabrir una cerrada exige motivo. | Abre un nuevo período de etapa |
| `paused` | Motivo + fecha **o** criterio de reactivación | Conserva la etapa; cierra el período |
| `won` | Evidencia verificable del compromiso (`wonEvidence`), fecha no futura | `wonAt`, `closedById`. No implica cobro |
| `lost` | `lossReason` (enum) | `lostAt`, `closedById` |
| `archived` | Solo legacy (backfill controlado) | Fuera de métricas y del tablero |

Todo cambio: `CommercialStatusChange`, `TimelineEvent(status_changed)`,
evento de workflow `status_changed`. Probabilidad ≠ estado.

### Historial de etapas

`OpportunityStageHistory`: un período por permanencia (`enteredAt`,
`exitedAt`, `source`, `actorId`). `enteredAt = null` significa fecha legacy
desconocida (no se inventa).

## Atribución comercial

`CommercialAttribution` = un toque (canal, campaña, UTM, landing, referidor
persona/partner, detalle, `touchedAt`, `method`). Canales:
`referral | campaign | web | linkedin_organic | outbound | event | partner | other`.

- Primer toque: `InboundLead.attributionId` → `CommercialLead.firstTouchAttributionId`
  → `Opportunity.firstTouchAttributionId` (la **misma** fila; nunca se copia
  ni se sobrescribe). Toques posteriores: `CommercialLead.lastTouchAttributionId`.
- `Campaign` (`/admin/settings/campaigns`): `key` = `utm_campaign` o
  `campaign_id` normalizado. Una key desconocida recibida por inbound crea la
  campaña con `createdVia=inbound` (no se inventa una que no vino).
- Legacy: `Company.source` y `Opportunity.source` se conservan; la migración
  creó atribuciones `method=migration` con el texto original en `sourceDetail`.

## Actividades y tareas

- **Tarea** = algo pendiente (`occurredAt = null`, estados
  `todo/in_progress/blocked/done`, `plannedDate` ≠ `dueDate`, prioridad).
- **Interacción** = algo que ocurrió (`occurredAt`, tipo/canal email,
  whatsapp, call, linkedin, meeting, other; resultado en `outcomes`). Nace
  `done` y no cuenta como pendiente.
- Ambas se vinculan a oportunidad, prospecto (`commercialLeadId`) o alianza
  (`commercialPartnerId`). Los ids vinculados se validan contra la
  organización (`resolveRecordLinks`).
- `/activities` es solo de tareas; filtros por vínculo, responsable,
  prioridad y vencimiento. Completar una tarea permite registrar resultado.
- Ingesta externa idempotente: `POST /api/integrations/activities`
  (`docs/integrations/commercial-events.md`).

## Próxima mejor acción

Reutiliza `nextStep`/`nextStepDueDate` (+ `nextStepChannel`,
`nextStepContext`, `nextStepActivityId`, `nextStepUpdatedAt`) en oportunidad,
lead y partner. Bloque en cada ficha: confirmar, editar, asociar tarea,
completar con resultado (opcionalmente como interacción) y proponer la
siguiente.

- **Nivel 1 — reglas** (`src/lib/commercial/next-action.ts`, puras, en cada
  render): sin responsable, sin acción o sin fecha, acción vencida, propuesta
  enviada sin respuesta (≥ 5 días o pasó la respuesta esperada), reunión sin
  próximo paso posterior, pausa por reactivar, tareas vencidas, contactado sin
  respuesta (≥ 7 días), lead sin oportunidad (≥ 14 días).
- **Nivel 2 — IA** bajo demanda ("Sugerir con IA"): una llamada al modelo con
  contexto acotado; no escribe nada. Las sugerencias se muestran como "no
  confirmadas" hasta que el usuario las usa.
- Cron `POST /api/cron/commercial-follow-ups`: para pausadas con
  `reactivateAt` vencido crea **una** tarea de seguimiento (idempotente por
  `externalSource=system`, `externalId=reactivation:<id>:<fecha>`) y emite
  `reactivation_due`. No cambia estados.

## Alianzas (`/partners`)

Pipeline sobre `CommercialPartner`: `identified → contacted → exploration →
negotiation → agreement → active`; estado `open | paused | discarded`
(pausar/descartar exige motivo). Acuerdo/Activo exigen `agreementTerms`.
Contactos en `CommercialPartnerContact`. Referidos = atribuciones con
`referrerPartnerId`; negocios = `OpportunityCommercialPartner` + referidos.
Porcentajes, snapshots y reparto de ofertas no cambian.

## Traspaso a Rumbo

Solo oportunidades `won`. `RumboHandoff` (una fila por oportunidad):
`pending → sent → confirmed | failed`. "Enviado" = el gateway aceptó el
evento; **solo** el callback de Rumbo marca "confirmado". No copia tareas
comerciales. Contrato en `docs/integrations/rumbo-handoff.md`.

## Métricas (`/analytics`, tool `get_commercial_funnel`)

Fórmulas (`src/lib/commercial/funnel.ts`):

- **Volumen del período**: registros cuyo evento real cae en [desde, hasta]
  (`identifiedAt`, `firstContactAt`, `becameLeadAt`, `convertedAt`,
  `createdAt`, primera entrada a `calificada` en el historial,
  `proposalSentAt`, `wonAt`, `lostAt`).
- **Conversión por cohorte**: de los creados en el período, fracción que
  alcanzó el hito (a la fecha de consulta). Win rate de cerradas = ganadas /
  (ganadas + perdidas) de la cohorte. Nunca se divide stock por stock.
- **Tiempos**: mediana y promedio en días con ambas fechas conocidas; se
  informa `n`.
- **Pipeline**: abiertas (`estimatedValue`), ponderado (`valor ×
  probabilidad`, solo con probabilidad), recurrente mensual y año 1 estimado
  (implementación + 12 × recurrente). Sin facturación: no son cobros.
- Desgloses por responsable, canal (primer toque), campaña y partner
  (referidor o participante del negocio). Oportunidades `archived` excluidas.
