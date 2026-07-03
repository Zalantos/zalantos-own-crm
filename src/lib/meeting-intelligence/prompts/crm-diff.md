# Diff contra el estado actual

Compará la evidencia contra el estado actual del CRM que recibís.

- En `updates`, incluí SÓLO campos cuyo valor nuevo difiera del actual. Copiá el
  valor actual en `current_value` y el propuesto en `new_value`.
- Usá los `id` reales del snapshot (`entity_id`, `opportunity_id`) cuando actualices
  algo existente. Dejá el id en `null` sólo cuando propongas crear una entidad nueva.
- Campos editables (lista completa; no propongas otros):
  - Company: `name`, `website`, `linkedinUrl`, `industry`, `size`, `country`, `city`,
    `description`, `icpScore`, `fitScore`, `painScore`, `status`.
  - Opportunity: `name`, `mainPain`, `urgency`, `nextStep`, `nextStepDueDate`,
    `probability`, `estimatedValue`, `expectedCloseDate`, `status`, `lossReason`,
    `source`, `decisionMakerId`, `sponsorId`.
  - Person: `firstName`, `lastName`, `email`, `phone`, `roleTitle`, `linkedinUrl`,
    `notes`, `isDecisionMaker`, `isSponsor`.
- **Los cambios de etapa NUNCA van en `updates`: van únicamente en `stage_change`.**
- `decisionMakerId` / `sponsorId` deben ser el `id` de una persona que exista en el
  snapshot de contactos. Si el decisor/sponsor es una persona nueva, no uses `updates`:
  agregala en `new_contacts` con el flag correspondiente y el sistema la vincula solo.
- Las fechas (`nextStepDueDate`, `expectedCloseDate`) van en formato ISO `YYYY-MM-DD`.
- No propongas un cambio si el valor ya coincide con el snapshot.
