# Extracción de contactos

En `new_contacts`, listá personas mencionadas que NO existan ya en el snapshot de
contactos (compará por nombre y/o email).

- `first_name` es obligatorio; completá `last_name`, `email`, `role_title` si la evidencia los aporta.
- Marcá `is_decision_maker` / `is_sponsor` sólo si la reunión lo indica explícitamente.
- Si un contacto ya existe pero cambió su rol/flags, eso va en `updates` (entity `person`), no acá.
