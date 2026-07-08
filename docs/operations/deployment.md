# Despliegue — CRM Zalantos

## Entornos

| Entorno | Propósito | Notas |
|---------|-----------|-------|
| Local | Desarrollo | `npm run dev` |
| Producción | Usuarios reales | (supuesto: Railway) |

GAP: entorno de staging no documentado en el repo.

## Plataforma de despliegue

**(Supuesto: Railway)** — evidencia en comentarios de `.env.example`
(`AUTH_TRUST_HOST`, `DATABASE_URL` auto-inyectado, `APP_URL` con dominio
`.up.railway.app`).

GAP: no hay `railway.json`, `Dockerfile` ni workflow de GitHub Actions en el
repositorio.

## Servicios requeridos

1. **App Next.js** — proceso Node ≥ 22.
2. **PostgreSQL** — vinculado a la app.
3. **Cloudflare R2** — bucket para evidencia (opcional en dev).
4. **Scheduler externo** — invocar crons HTTP (Railway Cron u otro).
5. **Gateway webhook** — n8n u host de automatización.

## Build

```bash
npm run build
# Equivale a: prisma generate && next build
```

## Start (producción)

```bash
npm run start
# Equivale a: prisma migrate deploy && next start
```

Las migraciones se aplican automáticamente al arrancar.

## Migraciones

- Desarrollo: `npm run prisma:migrate:dev`
- Producción: incluido en `npm run start` vía `prisma migrate deploy`
- Setup RLS (una vez por entorno): `scripts/sql/setup-roles.sql`

## Variables de entorno requeridas (producción mínimo)

| Variable | Requerida |
|----------|-----------|
| `DATABASE_URL` | Sí |
| `AUTH_SECRET` | Sí |
| `AUTH_TRUST_HOST` | Sí (proxy) |
| `APP_URL` | Sí |
| `CRON_SECRET` | Sí (si hay crons) |
| `GROQ_API_KEY` | Sí (Meeting Intelligence) |
| `R2_*` | Sí (uploads) |
| `INTEGRATION_GATEWAY_*` | Si hay notificaciones |
| `TENANT_DATABASE_URL` | Recomendado (RLS) |
| `SETTINGS_ENCRYPTION_KEY` | Si gateway por org |

Ver tabla completa en `docs/operations/env-vars.md`.

## Proceso de deploy

1. Push a rama conectada a Railway (supuesto).
2. Build automático (`npm run build`).
3. Start con migraciones.
4. Verificar health: login, dashboard, cron 401 sin secret.
5. GAP: smoke tests automatizados post-deploy.

## Rollback

1. Revertir deploy a imagen/commit anterior en Railway.
2. **Cuidado:** migraciones ya aplicadas no se revierten automáticamente.
3. Si la migración es incompatible, preparar migración correctiva manual.
4. GAP: procedimiento de rollback de DB documentado externamente.

## Gaps

- GAP: configuración Railway versionada.
- GAP: réplicas y escalado horizontal.
- GAP: CDN / edge para assets.
- GAP: backups automatizados de Postgres.
