# Estrategia de testing — CRM Zalantos

## Estado actual

Hay tests puntuales con el runner nativo de Node:

- `src/lib/observability/reporter.test.ts` → `npm run test:observability`
- `src/lib/crm/person-dedup.test.ts` y
  `src/lib/meeting-intelligence/apply-lock.test.ts` /
  `src/lib/meeting-intelligence/apply-revert.test.ts` →
  `npm run test:contact-dedup`
- `src/lib/mcp/server.test.ts` y tests de tools del agente →
  `npm run test:mcp-tools`

**GAP:** No hay suite amplia ni configuración Jest/Vitest/Playwright para el
resto del dominio (tenant, propuestas, agent, Telegram).

## Qué debe testearse siempre (cuando exista suite)

| Área                                    | Prioridad | Motivo                         |
| --------------------------------------- | --------- | ------------------------------ |
| `src/lib/tenant.ts`                     | Crítica   | Aislamiento multi-tenant       |
| `src/lib/crm/person-dedup.ts`           | Alta      | Evitar duplicados de contactos |
| `src/lib/agent/proposals.ts`            | Alta      | Registro y ejecución directa   |
| `src/lib/meeting-intelligence/apply.ts` | Alta      | Aplicar/revertir cambios IA    |
| `src/lib/integrations/gateway.ts`       | Media     | Dedupe y despacho              |
| `src/lib/zod/*`                         | Media     | Validación de input            |
| Workflows (`src/lib/workflows/`)        | Media     | Automatización                 |

## Qué puede testearse manualmente al inicio

- Flujos de login, invite, reset-password.
- CRUD de empresas, personas, oportunidades.
- Upload de evidencia y pipeline de meeting (con Groq/R2 configurados).
- Actividad de IA: filtros, atención y reversión individual/grupal.
- Chat y Telegram: mutación directa, baja confianza y trazabilidad.
- Acción destructiva: sin escritura previa y aprobación por solicitante/ADMIN.
- Crons con `curl` + `CRON_SECRET`.

## Cómo ejecutar tests (futuro)

GAP: definir framework (recomendado: Vitest para unit, Playwright para E2E).

```bash
# Propuesto cuando exista configuración:
# npm test
# npm run test:e2e
```

## Scripts disponibles hoy

| Script                                  | Uso                                                  |
| --------------------------------------- | ---------------------------------------------------- |
| `npm run lint`                          | ESLint                                               |
| `npm run format:check`                  | Prettier                                             |
| `npm run test:contact-dedup`            | Normalización de contactos y candado de propuestas   |
| `npm run test:mcp-tools`                | Contratos de tools agente/MCP y validación de inputs |
| `npm run test:observability`            | Test del payload Observability                       |
| `npm run seed:check`                    | Verificar datos de seed                              |
| `npx tsx scripts/check-rls-coverage.ts` | Verificar cobertura RLS                              |

## Casos críticos

1. Usuario de org A no puede leer/escribir datos de org B.
2. Mutación IA no destructiva se aplica y registra aunque tenga baja confianza.
3. Ítem aplicado se revierte sólo antes de 90 días y sin cambios posteriores.
4. Reversión grupal prevalida todos los ítems y usa orden inverso.
5. Un fallo deja el lote `partially_applied` sin revertir sus hermanos.
6. Acciones destructivas esperan aprobación del solicitante o un `ADMIN`.
7. `dedupeKey` evita deliveries duplicados al gateway.
8. Cron sin secret retorna 401.
9. ADMIN requerido en rutas `/admin/*`.

## Criterios mínimos antes de merge

- [ ] `npm run lint` sin errores en archivos modificados.
- [ ] `npm run build` exitoso si hay cambios de tipos o imports.
- [ ] Verificación manual del flujo afectado documentada en PR.
- [ ] GAP: tests automatizados obligatorios cuando exista CI.

## Gaps

- GAP: framework de testing no elegido ni configurado.
- GAP: CI/CD con tests no presente en `.github/workflows/`.
- GAP: base de datos de test / fixtures.
