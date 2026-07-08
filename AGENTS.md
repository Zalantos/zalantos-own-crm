# AGENTS.md — CRM Zalantos

Reglas generales para cualquier agente de código (Cursor, Claude Code, Copilot,
etc.) que trabaje en este repositorio.

## Regla de oro

**No modificar código funcional** salvo que el usuario lo pida explícitamente.
Los cambios de documentación, comentarios de contexto y plantillas son seguros.

## Carga progresiva de contexto

**No cargar toda la documentación por defecto.**

Para cualquier tarea, leer primero:

- `docs/context/context.md`
- `docs/context/data_model_context.md`
- `docs/architecture/architecture.md`
- `AGENTS.md`

Leer documentos adicionales solo cuando la tarea lo requiera:

| Documento | Cuándo leerlo |
|-----------|---------------|
| `docs/context/context-extended.md` | Lógica de negocio core, pipelines, agente, workflows |
| `docs/architecture/decisions.md` | Cambios de arquitectura, dependencias, infra, auth, colas |
| `docs/architecture/integrations.md` | APIs, webhooks, email, IA, R2, gateway |
| `docs/engineering/security-checklist.md` | Auth, permisos, datos personales, producción |
| `docs/engineering/testing-strategy.md` | Lógica de negocio, integraciones, permisos |
| `docs/operations/deployment.md` | Deploy, Railway, migraciones, env vars |
| `docs/operations/env-vars.md` | Variables de entorno |
| `docs/operations/runbook.md` | Operación, crons, errores comunes |

## Archivos obligatorios antes de editar

1. Leer el código relevante en `src/lib/` y `src/app/` antes de proponer cambios.
2. Si el cambio toca el modelo de datos, leer `prisma/schema.prisma` y
   `docs/context/data_model_context.md`.
3. Si el cambio toca multi-tenancy, leer `src/lib/tenant.ts` y
   `src/lib/prisma.ts`.

## Acciones prohibidas (sin autorización explícita)

- Refactorizar código no relacionado con la tarea.
- Cambiar esquema de base de datos o migraciones existentes sin revisión.
- Modificar auth, permisos o RLS sin revisión de seguridad.
- Añadir dependencias npm innecesarias.
- Exponer secretos en código, logs o documentación.
- Ejecutar seed contra bases de datos de producción.
- Mezclar feature + refactor + bugfix en un solo cambio sin motivo.

## Comportamiento requerido antes de editar

- Confirmar el alcance con el usuario si es ambiguo.
- Identificar si el cambio es de tenant (`forOrg`) o system (`prismaSystem`).
- Verificar impacto en RLS si se toca acceso a datos.
- Respetar convenciones: kebab-case en archivos, camelCase en variables, named
  exports, comentarios `//` (no JSDoc).

## Comportamiento requerido después de editar

- Ejecutar `npm run lint` en archivos modificados.
- Si hay cambios de schema: generar migración Prisma, no editar migraciones
  ya aplicadas en producción.
- Actualizar documentación afectada (ver checklist en
  `.github/pull_request_template.md`).
- Reportar archivos creados/modificados y riesgos.

## Formato de respuesta

- Responder en español salvo que el usuario pida otro idioma.
- Explicar el *por qué*, no solo el *qué*.
- Marcar supuestos con `(supuesto: …)` y lagunas con `GAP:`.

## Reglas por dominio

### Modelo de datos

- Toda entidad de tenant lleva `organizationId`.
- No inventar campos ni relaciones no presentes en `schema.prisma`.
- Los `PipelineStage` reemplazan enums fijos de etapa; usar `key` estable.

### Arquitectura

- Multi-tenancy en dos capas: filtro de app (`forOrg`) + RLS opcional
  (`TENANT_DATABASE_URL`).
- Operaciones de tenant nunca usan `db.organization` directamente.
- Auth y superadmin usan `prismaSystem` (rol con DDL).

### Auth y permisos

- Roles: `ADMIN`, `MEMBER`; super-admins pueden no tener `organizationId`.
- Rutas `/admin/*` requieren `ADMIN`; `/superadmin/*` requieren `isSuperAdmin`.
- Sesión JWT 10h; credenciales con bcrypt.

### Integraciones

- El gateway externo recibe webhooks con `x-webhook-secret`.
- Dedupe vía `IntegrationDelivery.dedupeKey` por organización.
- Secretos por org cifrados con `SETTINGS_ENCRYPTION_KEY`.

### Deploy

- `npm run start` ejecuta migraciones antes de arrancar.
- Crons protegidos con `CRON_SECRET` en header `Authorization`.
- GAP: configuración Railway no versionada en el repo.
