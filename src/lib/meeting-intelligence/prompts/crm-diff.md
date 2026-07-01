# Diff contra el estado actual

Compará la evidencia contra el estado actual del CRM que recibís.

- En `updates`, incluí SÓLO campos cuyo valor nuevo difiera del actual. Copiá el
  valor actual en `current_value` y el propuesto en `new_value`.
- Usá los `id` reales del snapshot (`entity_id`, `opportunity_id`) cuando actualices
  algo existente. Dejá el id en `null` sólo cuando propongas crear una entidad nueva.
- Campos editables típicos:
  - Company: `industry`, `size`, `country`, `city`, `description`, `painScore`, `status`.
  - Opportunity: `mainPain`, `urgency`, `nextStep`, `probability`, `estimatedValue`, `expectedCloseDate`, `stage`, `status`, `lossReason`.
  - Person: `email`, `phone`, `roleTitle`, `isDecisionMaker`, `isSponsor`.
- No propongas un cambio si el valor ya coincide con el snapshot.
