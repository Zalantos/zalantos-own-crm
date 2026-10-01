# Inbound Leads (n8n → backend)

Bandeja de leads externos con revisión humana antes de tocar el CRM. Hoy el
único canal activo es el formulario de contacto de la web de Zalantos:

```
Formulario web → n8n → DB de la página web → POST /api/integrations/inbound-leads → bandeja /leads
```

n8n sigue enviando por su cuenta el email "Nuevo prospecto desde la página
web"; el CRM **no** envía ningún email al recibir el lead.

## Por qué una bandeja y no creación automática

Un lead entrante puede ser spam, un duplicado o un contacto que todavía no es
una oportunidad real. El endpoint de ingesta solo crea un `InboundLead` en
estado `new`; `Company`/`Person`/`Opportunity` se crean recién cuando un
usuario humano lo convierte desde `/leads`.

## Autenticación (n8n → backend)

`Authorization: Bearer <INBOUND_LEADS_SECRET>` (timing-safe, mismo mecanismo
que Telegram/crons — ver `src/lib/meeting-intelligence/internal-auth.ts`).
Secreto **dedicado**, distinto de `INTEGRATION_GATEWAY_SECRET`: si se filtra,
no compromete el gateway saliente ni el canal de Telegram.

El caller nunca elige la organización. Hoy el endpoint solo sirve a Zalantos:
la organización se resuelve por `Organization.slug` desde la env var
`INBOUND_LEADS_ORGANIZATION_SLUG`, vía `prismaSystem` (el canal no tiene
sesión web). Soportar múltiples organizaciones en el futuro requeriría un
secreto por organización en vez de uno global + un slug fijo.

## Endpoint

### `POST /api/integrations/inbound-leads`

Body (snake_case, igual que lo manda el nodo HTTP de n8n):

```json
{
  "source": "website_contact",
  "external_id": "UUID-O-ID-DEL-LEAD",
  "first_name": "Tomás",
  "last_name": "Rodríguez",
  "email": "tomas@empresa.cl",
  "company": "Empresa SpA",
  "message": "Queremos automatizar nuestro proceso...",
  "page": "/contacto"
}
```

Solo `source` y `external_id` son obligatorios. `email`, si viene, debe ser un
email válido; se normaliza (`trim` + minúsculas) antes de guardarse.

Respuestas:

```json
{ "ok": true, "created": true, "inboundLeadId": "..." }   // 201, primera vez
{ "ok": true, "created": false, "inboundLeadId": "..." }  // 200, reintento
{ "ok": false, "error": "invalid_payload", "details": {...} } // 400
{ "ok": false, "error": "unauthorized" }                   // 401
{ "ok": false, "error": "server_error" }                   // 500
```

`source` es un string libre y extensible: hoy solo `website_contact`, pero el
modelo admite `referral`, `linkedin`, `campaign`, `partner`, `manual`, etc. sin
cambios de schema.

## Idempotencia

`@@unique([organizationId, source, externalId])` en `inbound_leads`. El
ingest (`src/lib/inbound-leads/ingest.ts`) hace `create` directo y resuelve el
conflicto (`P2002`) con un lookup — no un `findFirst` previo, que sería
vulnerable a condiciones de carrera si n8n reintenta el mismo POST en
paralelo. Un reintento con el mismo `external_id` devuelve `created: false`
con el mismo `inboundLeadId`, nunca crea un segundo registro.

## Bandeja (`/leads`)

Lista con filtros por estado (`new` | `reviewed` | `converted` | `rejected`,
tabs "Todos/Nuevos/Revisados/Convertidos/Descartados") y detalle por lead.
Acciones explícitas desde el detalle — abrir un lead **no** cambia su estado
solo:

- **Marcar revisado**: `new → reviewed`.
- **Descartar**: `* → rejected` (soft, nunca se borra el registro).
- **Convertir a CRM**: ver abajo.

El dashboard principal muestra un bloque "Leads entrantes" con el conteo de
`new` y los últimos 3.

## Conversión a CRM

Lógica en `src/lib/inbound-leads/convert.ts` (`convertLeadTx`), invocada
dentro de `withOrgTransaction` desde
`src/app/(dashboard)/leads/actions.ts#convertInboundLead`. Mismo patrón que
`meeting-intelligence/apply.ts`: transacción única, eventos de timeline con
los tipos ya existentes (`company_created`, `contact_added`/`contact_linked`,
`opportunity_created`, `note_added`).

1. **Company**: si el usuario elige una empresa existente (se le ofrecen
   coincidencias por nombre), se reutiliza; si no, se crea una con
   `InboundLead.company` (o el nombre editado en el form).
2. **Person**: reutiliza `findExistingPerson` (`src/lib/crm/person-dedup.ts`)
   — email primero, si no nombre+apellido dentro de la misma empresa. Si la
   persona existe en **otra** empresa, la conversión falla con un mensaje
   explícito en vez de reasignarla silenciosamente.
3. **Opportunity**: se crea siempre, en la primera etapa activa del pipeline
   de la organización (sin hardcodear nombres de etapa — mismo criterio que
   `opportunities/actions.ts`).
4. **Note**: si el lead trae mensaje, se agrega como nota vinculada a la
   empresa/persona/oportunidad, para no perder el contexto original.
5. El `InboundLead` pasa a `status=converted`, con `convertedAt` y las tres
   referencias (`convertedCompanyId`, `convertedPersonId`,
   `convertedOpportunityId`).

Todas las entidades creadas llevan `createdVia: "inbound_lead"`.

## Variables de entorno

- `INBOUND_LEADS_SECRET` (requerida) — Bearer del canal de ingesta.
- `INBOUND_LEADS_ORGANIZATION_SLUG` (requerida) — `Organization.slug` al que
  se asignan los leads entrantes hoy.

## Gaps

- GAP: un solo tenant soportado (no hay secreto/slug por organización).
- GAP: el email "Nuevo prospecto desde la página web" lo sigue mandando n8n;
  el CRM no notifica nada al recibir el lead.
- GAP: scoring, enriquecimiento automático o asignación de vendedor no
  implementados — conversión 100% manual.
