# Arquitectura — CRM Zalantos

## Vista general

Aplicación **monolítica Next.js** con Server Components, Server Actions y Route
Handlers. No hay backend NestJS separado; la lógica vive en `src/lib/`.

```txt
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js 16 App  │────▶│ PostgreSQL  │
│  React 19   │◀────│  (RSC + API)     │◀────│  + Prisma   │
└─────────────┘     └────────┬─────────┘     └─────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         Cloudflare R2    Groq / etc.   Webhook gateway
         (evidencia)      (IA)          (n8n u otro)
```

## Frontend

- App Router con grupos `(dashboard)`, `(superadmin)`.
- `/` es una landing pública; el producto autenticado vive en rutas protegidas.
- UI: Tailwind CSS 4 + Base UI/shadcn según el área.
- Estado local React; sin Jotai/Redux global.
- Agente: panel lateral con `@ai-sdk/react`.

## Backend (dentro de Next.js)

- **Server Actions** en `actions.ts` por módulo de ruta.
- **API routes** para streaming (agent chat), crons, presign R2, auth.
- **Middleware** Auth.js para protección de rutas.

## Base de datos

- PostgreSQL con Prisma 7 (`@prisma/adapter-pg`).
- Dos clientes:
  - `prismaSystem`: DDL, auth, superadmin, crons cross-tenant.
  - `forOrg(orgId)`: operaciones CRM con scope de tenant + RLS opcional.
- Migraciones en `prisma/migrations/`; deploy con `prisma migrate deploy`.

## Almacenamiento

- **Cloudflare R2** (S3-compatible) para evidencia de meetings, adjuntos del
  agente y documentos de contexto de entidad
  (`src/lib/meeting-intelligence/storage/r2.ts`).
- Presign vía `/api/evidence/presign` y `/api/entity-context/presign`.
- Keys: `meetings/…`, `agent/…`, `context/{entityType}/{entityId}/…`.

## Workers / jobs

No hay worker separado. Procesamiento asíncrono vía:

1. `after()` post-upload para meetings y entity-context.
2. Callback interno POST `/api/meetings/process` / `/api/entity-context/process`.
3. Crons HTTP (`/api/cron/*`) invocados externamente (Railway cron u otro).

## Integraciones

Ver `docs/architecture/integrations.md`.

## Auth

- Auth.js v5, JWT en cookie, Credentials provider.
- `/` queda fuera del gate de sesión para mostrar la landing pública; `/login`
  sigue siendo la entrada al CRM.
- `AUTH_TRUST_HOST=true` requerido detrás de proxy (Railway).
- Roles en JWT: `role`, `organizationId`, `isSuperAdmin`.

## Entornos

| Entorno | Notas |
|---------|-------|
| Local | `npm run dev`, PostgreSQL local |
| Producción | (supuesto: Railway) `npm run start`, env inyectados |

GAP: archivos de configuración Railway/Vercel no presentes en el repo.

## Flujo de información

1. Usuario autenticado → sesión JWT con `organizationId`.
2. Páginas dashboard llaman `requireOrgContext()` → `forOrg(orgId)`.
3. Mutaciones validadas con Zod (`src/lib/zod/`).
4. Eventos de negocio pueden disparar workflows e integraciones.
5. Meeting/agent/enrichment generan propuestas → revisión humana → apply.
6. Tab Contexto en fichas: upload → perfil IA auto + propuestas de campos.

## Riesgos arquitectónicos

- Crons y pipeline en el mismo proceso que la web (sin cola dedicada).
- Rate limiting en memoria no escala horizontalmente.
- Fan-out de queries en RSC puede agotar pool tenant.

## Decisiones pendientes

- GAP: cola de mensajes (BullMQ, etc.) para pipeline de meetings.
- GAP: estrategia de observabilidad en producción.
- GAP: CDN/cache para assets estáticos en producción.
