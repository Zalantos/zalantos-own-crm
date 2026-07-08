# Runbook operativo — CRM Zalantos

## Arranque local

```bash
cp .env.example .env
# Configurar DATABASE_URL y AUTH_SECRET mínimo

npm install
npm run prisma:migrate:dev
npm run prisma:seed          # opcional
npm run dev                  # http://localhost:3000
```

## Logs

- Desarrollo: stdout del proceso `next dev`.
- Producción: logs del servicio Railway (supuesto).
- GAP: agregación centralizada (Datadog, etc.) no configurada.

## Reinicio

- Local: Ctrl+C y `npm run dev`.
- Producción: restart del servicio en Railway.
- Tras restart, cron `process-evidence` recupera meetings atascados.

## Migraciones

```bash
# Desarrollo
npm run prisma:migrate:dev

# Producción (automático en start)
npm run prisma:migrate:deploy
```

### Setup RLS (una vez por entorno)

```bash
psql "$DATABASE_URL" -v crm_app_password='<password>' \
  -f scripts/sql/setup-roles.sql
```

Luego setear `TENANT_DATABASE_URL` con el rol `crm_app`.

Verificar:

```bash
npx tsx scripts/check-rls-coverage.ts
```

## Errores comunes

### Login falla en producción

- Verificar `AUTH_TRUST_HOST=true`.
- Verificar `AUTH_URL` o `APP_URL` coincide con dominio público.
- Verificar `AUTH_SECRET` configurado.

### `P2028 Unable to start a transaction`

- Pool tenant agotado por fan-out de queries en RSC.
- Aumentar `TENANT_DB_POOL_MAX` o reducir paralelismo.
- Ver comentarios en `src/lib/tenant.ts`.

### Meeting atascado en `extracting` / `transcribing`

- Verificar `GROQ_API_KEY` y cuota Groq.
- Verificar credenciales R2 y que el archivo exista en bucket.
- Invocar cron catch-up:

```bash
curl -X POST "$APP_URL/api/cron/process-evidence" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Meeting en `failed`

- Revisar `processingError` en DB o UI.
- Requiere reintento manual (no auto-loop por diseño).
- GAP: botón de retry en UI — verificar si existe.

### Integraciones no envían email/Slack

- Verificar `INTEGRATION_GATEWAY_URL` y secret.
- Revisar tabla `integration_deliveries` (status, `lastError`).
- Verificar workflow n8n del gateway.

### `SETTINGS_ENCRYPTION_KEY` error

- Requerida cuando org tiene `integrationGatewaySecret`.
- Debe ser exactamente 32 bytes (base64 o hex).

## Validación en producción

1. Login con usuario de prueba.
2. Listar empresas del tenant.
3. Crear nota o actividad.
4. `curl` cron sin secret → 401.
5. GAP: checklist automatizado.

## Playbooks de fallo de integración

### Groq caído o rate limited

- Meetings quedan en estado intermedio o `failed`.
- Activar cron `process-evidence` cuando el servicio recupere.
- Considerar fallback de modelo vía `MEETING_REASONING_MODEL`.

### R2 inaccesible

- Uploads y pipeline fallan en extracción/transcripción.
- Verificar credenciales y estado de Cloudflare.
- Evidencia con `storagePath` vacío = transcript manual inline.

### Gateway webhook caído

- Deliveries en `failed` con error HTTP.
- Revisar logs n8n.
- GAP: reintento automático no implementado.

## Scripts útiles

| Script | Uso |
|--------|-----|
| `npx tsx scripts/promote-superadmin.ts` | Promover super-admin |
| `npx tsx scripts/import-notion.ts` | Import desde Notion |
| `npx tsx scripts/check-seed-data.ts` | Verificar seed |
| `npm run prisma:studio` | Explorar DB |

## Contactos / responsables

GAP: definir on-call y responsables de infra, DB y integraciones n8n.
