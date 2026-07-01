# Extracción de dolor y contexto de venta

- `pain_updates`: dolores concretos del cliente detectados en la reunión, asociados a la
  oportunidad (`opportunity_id`). Redactá el dolor en una o dos frases claras.
- `risks`: riesgos del deal (presupuesto, competencia, falta de sponsor/decisor, urgencia baja).
- `decisions`: decisiones tomadas durante la reunión.
- `next_steps`: próximos pasos acordados; convertilos en tareas accionables con `due_in_days` si se mencionó un plazo.
- `notes`: contexto cualitativo relevante que no encaja como campo estructurado.
