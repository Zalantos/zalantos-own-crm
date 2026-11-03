# Traspaso CRM → Rumbo

Estado: **CRM implementado; integración externa pendiente** (no hay en este
repositorio un contrato consumible de Rumbo). El CRM nunca simula éxito.

## Flujo

1. Oportunidad `won` → ficha → **Traspasar a Rumbo** (nombre de proyecto,
   fecha de inicio, responsable, alcance acordado).
2. El CRM guarda/actualiza `RumboHandoff` (una fila por oportunidad;
   `attempts` cuenta reintentos) y despacha por el gateway de integraciones
   (`IntegrationDelivery`, mismo canal que las notificaciones n8n).
3. Si el gateway responde OK → `status=sent` (pendiente de confirmación).
   Si falla → `status=failed` con `lastError` (reintentable desde la ficha).
4. Rumbo (o n8n en su nombre) confirma con el callback → `status=confirmed`
   (o `failed`). Una vez confirmado, el CRM no permite reenviar.

Una oportunidad ganada **no** se bloquea si Rumbo no está disponible.

## Evento saliente (gateway)

`POST {INTEGRATION_GATEWAY_URL}` con `x-webhook-secret`, envelope estándar
del gateway:

```json
{
  "eventId": "<integrationDeliveryId>",
  "event": "send_notification",
  "notificationType": "rumbo.project_handoff",
  "channel": "rumbo",
  "dedupeKey": "rumbo.project_handoff:<handoffId>:<attempt>",
  "recipient": { "system": "rumbo" },
  "payload": {
    "handoffId": "…",
    "version": "2026-11-01",
    "organization": { "id": "…", "name": "…", "slug": "…" },
    "client": { "id": "…", "name": "…", "website": null },
    "opportunity": {
      "id": "…", "name": "…", "url": "https://crm…/opportunities/…",
      "wonAt": "2026-11-03T…", "commitmentEvidence": "Contrato firmado…",
      "estimatedImplementationValue": "8500000", "estimatedMonthlyRecurringValue": null
    },
    "project": { "name": "…", "startDate": "2026-11-10", "agreedScope": "…", "responsibleUserId": "…" },
    "context": { "pain": "…", "situation": null, "impact": null, "lastCommercialNextStep": "…" },
    "people": { "commercialOwner": {…}, "decisionMaker": {…}, "sponsor": null },
    "commercialOffer": { "id": "…", "version": 2, "status": "accepted", "pricingUnit": "UF", "netAmount": "…", "documents": [ … ] }
  }
}
```

Rumbo debe deduplicar por `handoffId` (estable entre reintentos). No se
envían tareas comerciales.

## Callback de confirmación

`POST /api/integrations/rumbo/handoff-status` — `Authorization: Bearer
<RUMBO_CALLBACK_SECRET>`.

```json
{ "handoff_id": "…", "status": "confirmed", "rumbo_project_id": "R-123", "rumbo_project_url": "https://rumbo…/p/123" }
{ "handoff_id": "…", "status": "failed", "error": "Cliente duplicado" }
```

Respuestas: `200 {ok:true,status}`; repetir una confirmación devuelve
`{unchanged:true}`; `404` handoff inexistente; `401` secreto inválido.

## Pendiente externo

- Implementar en n8n/Rumbo la recepción de `rumbo.project_handoff` y el
  callback. Configurar `RUMBO_CALLBACK_SECRET`.
