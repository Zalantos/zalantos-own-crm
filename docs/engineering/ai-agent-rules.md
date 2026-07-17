# Reglas para agentes IA — CRM Zalantos

## Reglas generales

1. Leer contexto progresivamente (ver `AGENTS.md`).
2. No modificar código funcional sin solicitud explícita del usuario.
3. Respetar multi-tenancy en todo acceso a datos.
4. No inventar campos del modelo de datos.
5. Responder en español.

## Carga de contexto

**No cargar toda la documentación por defecto.**

Leer primero:

- `docs/context/context.md`
- `docs/context/data_model_context.md`
- `docs/architecture/architecture.md`
- `AGENTS.md`

Condicional:

- `context-extended.md` → pipelines, agente, workflows
- `decisions.md` → arquitectura, infra, auth
- `integrations.md` → APIs, IA, R2, gateway, Telegram
- `docs/integrations/telegram-copiloto.md` → contrato n8n ↔ Telegram
- `security-checklist.md` → auth, PII, producción
- `testing-strategy.md` → lógica de negocio
- `operations/*` → deploy, env, runbook

## Protocolo de modificación de código

1. Identificar módulo y si es código tenant o system.
2. Leer archivos existentes del patrón (actions, lib).
3. Cambio mínimo necesario.
4. Validar con Zod donde corresponda.
5. Lint (`npm run lint`).
6. Reportar archivos y riesgos.

## Reglas de reporte

- Listar archivos tocados.
- Indicar migraciones nuevas.
- Indicar env vars nuevas.
- Marcar GAPs descubiertos.

## Prohibiciones

- Refactors no solicitados.
- Dependencias npm sin justificación.
- Secretos en código o docs.
- Editar migraciones ya en producción.
- `any` en TypeScript.
- Default exports.

## Reglas de documentación

Actualizar docs cuando cambie:

- Modelo de datos o reglas de negocio.
- Integraciones o variables de entorno.
- Flujos de deploy u operación.

## Reglas de testing

- GAP: no hay suite existente; al añadir lógica crítica, proponer tests.
- Ver `docs/engineering/testing-strategy.md`.

## Reglas de seguridad

- Nunca loguear passwords, tokens ni API keys.
- Validar input con Zod en Server Actions.
- Crons solo con `CRON_SECRET` válido.
- Ver checklist completo en `security-checklist.md`.

## Reglas del modelo de datos

- `organizationId` obligatorio en writes de tenant.
- Usar `forOrg(orgId)`, no `prismaSystem` para CRM.
- Propuestas IA pasan por `CRMChangeProposal`, no escritura directa.

## Reglas de prompts / proveedores IA

- Prompts de meeting en `src/lib/meeting-intelligence/prompts/`.
- No hardcodear API keys; usar env vars.
- Modelos configurables vía `AGENT_MODEL`, `MEETING_REASONING_MODEL`.
- Mantener trazabilidad: `CRMChangeProposal.model`, `rawModelOutput`.
