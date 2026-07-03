# Formato de salida (OBLIGATORIO)

Respondé EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional, sin markdown,
sin comentarios. Esta es la única forma aceptada.

Estructura:

```json
{
  "summary": { "headline": "string", "key_points": ["string"] },
  "updates": [
    { "entity": "company|opportunity|person", "entity_id": "id o null",
      "field": "string", "current_value": "cualquiera", "new_value": "cualquiera",
      "confidence": 0.0, "explanation": "string" }
  ],
  "new_contacts": [
    { "first_name": "string", "last_name": "string", "email": "string|null",
      "phone": "string|null", "role_title": "string|null",
      "linkedin_url": "string|null", "notes": "string|null",
      "is_decision_maker": false, "is_sponsor": false,
      "confidence": 0.0, "explanation": "string" }
  ],
  "tasks": [
    { "title": "string", "description": "string", "due_in_days": 7,
      "confidence": 0.0, "explanation": "string" }
  ],
  "notes": [
    { "title": "string|null", "body": "string", "confidence": 0.0, "explanation": "string" }
  ],
  "stage_change": {
    "opportunity_id": "id o null", "from_stage": "string|null", "to_stage": "string",
    "confidence": 0.0, "explanation": "string"
  },
  "pain_updates": [
    { "opportunity_id": "id o null", "pain": "string", "confidence": 0.0, "explanation": "string" }
  ],
  "next_step_update": {
    "opportunity_id": "id o null", "next_step": "string",
    "due_date": "YYYY-MM-DD o null",
    "confidence": 0.0, "explanation": "string"
  },
  "risks": ["string"],
  "decisions": ["string"],
  "next_steps": [
    { "title": "string", "description": "string", "due_in_days": 7,
      "confidence": 0.0, "explanation": "string" }
  ],
  "confidence": 0.0
}
```

- Cualquier sección sin contenido debe ser `[]`, `{}` o `null` según corresponda; nunca la omitas.
- `next_step_update` es obligatorio en cada análisis (ver la sección "Próximo paso").
- `stage_change.to_stage` debe ser uno de estos valores exactos:
  `lead_identificado`, `investigacion_realizada`, `primer_contacto`, `reunion_discovery`,
  `dolor_validado`, `sprint_0_ofrecido`, `sprint_0_aceptado`, `diagnostico_realizado`,
  `propuesta_principal`, `negociacion`, `ganado`, `perdido`.
- `confidence` global refleja tu confianza en el conjunto de la propuesta.
