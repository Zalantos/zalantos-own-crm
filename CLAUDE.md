# CLAUDE.md — CRM Zalantos

Instrucciones específicas para Claude Code al trabajar en este repositorio.

## Resumen del proyecto

CRM multi-tenant Next.js + Prisma + PostgreSQL para Zalantos. Incluye Meeting
Intelligence (pipeline de evidencia → transcripción → propuestas CRM), agente IA
copiloto con herramientas de lectura/escritura del CRM, y canal Telegram vía n8n.

## Comandos clave

```bash
npm run dev                    # Desarrollo
npm run build                  # Build producción
npm run start                  # Migraciones + start
npm run lint                   # ESLint
npm run format                 # Prettier
npm run prisma:migrate:dev     # Migración en dev
npm run prisma:migrate:deploy  # Migración en prod
npm run prisma:seed            # Seed (solo dev)
npm run prisma:studio          # Explorar DB
```

Node.js ≥ 22 (ver `.nvmrc`).

## Política de carga de contexto

**No cargar toda la documentación por defecto.**

Leer primero:

- `docs/context/context.md`
- `docs/context/data_model_context.md`
- `docs/architecture/architecture.md`
- `AGENTS.md`

Documentos adicionales según la tarea (ver tabla en `AGENTS.md`).

## Expectativas de planificación

### Tareas pequeñas (1–3 archivos)

- Leer contexto mínimo + código afectado.
- Implementar cambio focalizado.
- Lint y reporte breve.

### Tareas grandes (múltiples módulos, schema, integraciones)

- Planificar antes de codificar.
- Identificar impacto en tenant vs system, RLS, crons, gateway.
- Dividir en pasos verificables.
- Actualizar docs si cambia comportamiento observable.

## Reporte de archivos modificados

Al finalizar, listar:

- Archivos creados / modificados / eliminados.
- Migraciones generadas (si aplica).
- Variables de entorno nuevas (si aplica).
- Riesgos y pasos de verificación manual.

## Prohibiciones

- No modificar migraciones ya desplegadas en producción.
- No añadir `any` en TypeScript.
- No usar default exports.
- No usar JSDoc; preferir comentarios `//` para lógica no obvia.
- No commitear sin que el usuario lo pida.
- No exponer `.env` ni secretos.

## Actualización de documentación

Si el cambio afecta modelo de datos, integraciones, deploy o flujos de negocio,
actualizar los docs correspondientes en `docs/` y marcar el checklist del PR.

## Áreas sensibles

| Área | Archivos clave |
|------|----------------|
| Multi-tenancy | `src/lib/tenant.ts`, `src/lib/prisma.ts` |
| Auth | `src/lib/auth.ts`, `src/lib/auth.config.ts` |
| Meeting pipeline | `src/lib/meeting-intelligence/pipeline.ts` |
| Agente IA | `src/lib/agent/`, `src/app/api/agent/` |
| Telegram | `src/lib/telegram/`, `src/app/api/telegram/` |
| Integraciones | `src/lib/integrations/gateway.ts` |
| Propuestas CRM | `src/lib/crm/proposal-policy.ts`, `src/lib/meeting-intelligence/apply.ts` |
| RLS | `scripts/sql/setup-roles.sql`, migración `enable_row_level_security` |
