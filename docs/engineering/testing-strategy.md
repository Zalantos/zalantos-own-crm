# Estrategia de testing — CRM Zalantos

## Estado actual

**GAP:** El repositorio no contiene tests automatizados (`*.test.ts`, `*.spec.ts`
ni configuración Jest/Vitest).

## Qué debe testearse siempre (cuando exista suite)

| Área | Prioridad | Motivo |
|------|-----------|--------|
| `src/lib/tenant.ts` | Crítica | Aislamiento multi-tenant |
| `src/lib/crm/person-dedup.ts` | Alta | Evitar duplicados de contactos |
| `src/lib/crm/proposal-policy.ts` | Alta | Reglas de auto-aprobación |
| `src/lib/meeting-intelligence/apply.ts` | Alta | Aplicar/revertir propuestas |
| `src/lib/integrations/gateway.ts` | Media | Dedupe y despacho |
| `src/lib/zod/*` | Media | Validación de input |
| Workflows (`src/lib/workflows/`) | Media | Automatización |

## Qué puede testearse manualmente al inicio

- Flujos de login, invite, reset-password.
- CRUD de empresas, personas, oportunidades.
- Upload de evidencia y pipeline de meeting (con Groq/R2 configurados).
- Revisión y aplicación de propuestas.
- Chat del agente con propuesta de cambio.
- Crons con `curl` + `CRON_SECRET`.

## Cómo ejecutar tests (futuro)

GAP: definir framework (recomendado: Vitest para unit, Playwright para E2E).

```bash
# Propuesto cuando exista configuración:
# npm test
# npm run test:e2e
```

## Scripts disponibles hoy

| Script | Uso |
|--------|-----|
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier |
| `npm run seed:check` | Verificar datos de seed |
| `npx tsx scripts/check-rls-coverage.ts` | Verificar cobertura RLS |

## Casos críticos

1. Usuario de org A no puede leer/escribir datos de org B.
2. Propuesta rechazada no aplica cambios.
3. Item aplicado puede revertirse con `revertData` correcto.
4. `dedupeKey` evita deliveries duplicados al gateway.
5. Cron sin secret retorna 401.
6. ADMIN requerido en rutas `/admin/*`.

## Criterios mínimos antes de merge

- [ ] `npm run lint` sin errores en archivos modificados.
- [ ] `npm run build` exitoso si hay cambios de tipos o imports.
- [ ] Verificación manual del flujo afectado documentada en PR.
- [ ] GAP: tests automatizados obligatorios cuando exista CI.

## Gaps

- GAP: framework de testing no elegido ni configurado.
- GAP: CI/CD con tests no presente en `.github/workflows/`.
- GAP: base de datos de test / fixtures.
