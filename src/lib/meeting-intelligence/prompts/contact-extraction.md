# Extracción de contactos

En `new_contacts`, listá personas mencionadas que NO existan ya en el snapshot de
contactos (compará por nombre y/o email).

- `first_name` es obligatorio; completá `last_name`, `email`, `phone`, `role_title`,
  `linkedin_url` y `notes` si la evidencia los aporta.
- Marcá `is_decision_maker` / `is_sponsor` sólo si la reunión lo indica explícitamente.
  Si el contacto nuevo tiene alguno de esos flags, el sistema lo vincula automáticamente
  como decisor/sponsor de la oportunidad de la reunión.
- Si un contacto ya existe pero cambió su rol/teléfono/flags, eso va en `updates`
  (entity `person`, con su `entity_id` del snapshot), no acá.
