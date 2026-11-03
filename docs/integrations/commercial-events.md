# Interacciones externas → CRM (email, WhatsApp, llamadas)

`POST /api/integrations/activities` — registra interacciones **ya
ocurridas** enviadas por n8n (o cualquier conector). Estado: **endpoint
implementado y probado; conectores Microsoft 365 / WhatsApp pendientes** (no
hay credenciales en este repo; no se simula sincronización).

## Auth y tenant

`Authorization: Bearer <COMMERCIAL_EVENTS_SECRET>` (secreto dedicado). La
organización la fija el servidor con `INTEGRATIONS_ORGANIZATION_SLUG`
(fallback `INBOUND_LEADS_ORGANIZATION_SLUG`); el caller no la elige.

## Payload

```json
{
  "source": "m365",
  "external_id": "AAMkAG…messageId",
  "type": "email",
  "occurred_at": "2026-11-03T14:05:00Z",
  "title": "Re: Propuesta Acme",
  "summary": "Cliente pide ajustar alcance",
  "outcomes": "Enviar versión 2",
  "duration_minutes": null,
  "participants": [{ "email": "ana@acme.cl" }, { "phone": "+56911111111" }],
  "opportunity_id": null,
  "commercial_lead_id": null,
  "commercial_partner_id": null,
  "company_id": null
}
```

`type`: `email | whatsapp | call | linkedin | meeting | other`.

## Resolución

1. Ids explícitos (validados dentro de la organización).
2. Si no: personas por email/teléfono → lead activo de esa persona → empresa
   de la persona.
3. Sin coincidencias → `202 {status:"unmatched"}` y **no se crea nada** (no
   se fabrican contactos).

Idempotencia: `@@unique([organizationId, externalSource, externalId])`;
reintentos devuelven `200 {status:"duplicate"}`. Fechas futuras se rechazan.
Crear: `201 {status:"created", activityId}`.
