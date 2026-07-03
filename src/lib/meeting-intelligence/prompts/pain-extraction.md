# Extracción de dolor y contexto de venta

- `pain_updates`: dolores concretos del cliente detectados en la reunión, asociados a la
  oportunidad (`opportunity_id`). Redactá el dolor en una o dos frases claras.
- `risks`: riesgos del deal (presupuesto, competencia, falta de sponsor/decisor, urgencia baja).
- `decisions`: decisiones tomadas durante la reunión.
- `next_steps`: próximos pasos acordados; convertilos en tareas accionables con `due_in_days` si se mencionó un plazo.
- `notes`: contexto cualitativo relevante que no encaja como campo estructurado.

# Próximo paso (OBLIGATORIO)

Después de CADA reunión, `next_step_update` debe traer el próximo paso de la
oportunidad, para que el campo `nextStep` del CRM nunca quede obsoleto:

- `next_step`: UNA frase accionable con el paso más importante que sigue
  (ej. "Enviar propuesta de Sprint 0 y agendar demo con el CFO").
- `due_date`: fecha ISO `YYYY-MM-DD` si en la reunión se mencionó un plazo; si no, `null`.
- Si la reunión acordó explícitamente un próximo paso, usalo con confidence alta.
- Si NO se acordó ninguno, proponé el paso lógico según la etapa de la oportunidad
  y marcalo con confidence baja (≤ 0.4) explicando que es inferido.
- `next_step_update` reemplaza el `nextStep` actual; `next_steps` (tareas) puede
  coexistir con él y detallar el resto de los compromisos.
