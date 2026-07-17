# Checklist de seguridad — CRM Zalantos

## Datos sensibles

- [ ] Emails, teléfonos, notas y transcripciones son PII — minimizar en logs.
- [ ] `integrationGatewaySecret` por org cifrado con `SETTINGS_ENCRYPTION_KEY`.
- [ ] Tokens de invitación/reset solo como SHA-256 en DB (`tokenHash`).
- [ ] Passwords solo como `passwordHash` (bcrypt).

## Autenticación

- [ ] `AUTH_SECRET` ≥ 32 bytes aleatorios en producción.
- [ ] `AUTH_TRUST_HOST=true` detrás de proxy (Railway).
- [ ] Sesión JWT 10h; logout invalida cookie.
- [ ] Usuarios `isActive=false` y orgs `isActive=false` bloqueados en login.
- [ ] Rate limit en login (ver `src/lib/rate-limit.ts`).

## Autorización

- [ ] `/admin/*` solo rol `ADMIN`.
- [ ] `/superadmin/*` solo `isSuperAdmin`.
- [ ] Super-admin sin org redirigido fuera del CRM tenant.
- [ ] Server Actions verifican sesión y org antes de mutar.

## Base de datos

- [ ] Cliente tenant usa `forOrg` — nunca omitir `organizationId`.
- [ ] `TENANT_DATABASE_URL` con rol `crm_app` (NOBYPASSRLS) en producción.
- [ ] `DATABASE_URL` / system role solo para migraciones y auth.
- [ ] No ejecutar `prisma:seed` en producción.

## Storage (R2)

- [ ] Presign con expiración corta.
- [ ] Keys de objeto no adivinables (generadas server-side).
- [ ] Credenciales R2 solo en servidor.

## APIs

- [ ] Crons requieren `CRON_SECRET` ≥ 16 chars, no placeholders.
- [ ] `/api/meetings/process` protegido con mismo secret.
- [ ] `/api/telegram/*` requiere Bearer `INTEGRATION_GATEWAY_SECRET` (timing-safe).
- [ ] Validar input con Zod en todas las rutas que aceptan body.

## Logs

- [ ] No loguear `CRON_SECRET`, API keys, passwords ni tokens crudos.
- [ ] No loguear contenido completo de transcripciones en producción.
- [ ] GAP: política de retención de logs no definida.

## Proveedores IA

- [ ] API keys solo en env del servidor.
- [ ] `rawModelOutput` en propuestas puede contener PII — acceso restringido a
      usuarios autenticados del tenant.
- [ ] Revisar prompts para no filtrar datos de otros tenants (scope por org en
      snapshot).

## Variables de entorno

- [ ] `.env` en `.gitignore`.
- [ ] `.env.example` sin valores reales.
- [ ] Rotar secretos tras incidente o exposición.

## Checklist de producción

- [ ] `SETTINGS_ENCRYPTION_KEY` configurada si hay gateway por org.
- [ ] RLS habilitado (`setup-roles.sql` + `TENANT_DATABASE_URL`).
- [ ] `ADMIN_PASSWORD` fuerte solo en seed de dev.
- [ ] HTTPS en URL pública (`APP_URL`, `AUTH_URL`).
- [ ] Crons con secret único por entorno.
- [ ] Si Telegram está activo: `INTEGRATION_GATEWAY_SECRET` rotado y solo en n8n + server.

## Checklist de deploy

- [ ] Migraciones aplicadas (`prisma migrate deploy` en `start`).
- [ ] Verificar login y una operación CRM post-deploy.
- [ ] Verificar cron `process-evidence` responde 401 sin secret.
- [ ] GAP: backup automático de Postgres documentado externamente.
