# CRM Zalantos

CRM multi-tenant para equipos comerciales de Zalantos y sus clientes. Combina
gestión de pipeline (empresas, personas, oportunidades, actividades), workflows
configurables, Meeting Intelligence (transcripción y propuestas de cambio al CRM
desde reuniones) y un agente IA copiloto integrado en la interfaz.

## Problema de negocio

Centralizar el seguimiento comercial B2B con trazabilidad de reuniones,
automatización de tareas y propuestas de actualización del CRM asistidas por IA,
sin depender de herramientas dispersas.

## Usuarios principales

- **Vendedores / account executives**: operan el pipeline diario.
- **Administradores de organización**: configuran usuarios, etapas, campos custom
  y workflows.
- **Super-admins de plataforma**: gestionan organizaciones (tenants) del SaaS.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Base UI/shadcn |
| Backend | Next.js Server Actions y Route Handlers |
| Base de datos | PostgreSQL + Prisma 7 |
| Auth | Auth.js v5 (NextAuth) con credenciales y JWT |
| IA | Vercel AI SDK (Groq, Anthropic, OpenAI) |
| Almacenamiento | Cloudflare R2 (evidencia de reuniones y adjuntos del agente) |
| Integraciones | Gateway webhook externo (n8n u otro) + Telegram copiloto |
| Observabilidad IA | Zalantos Observability (`service_name: backend`) |

## Setup local

Requisitos: Node.js ≥ 22, PostgreSQL.

```bash
cp .env.example .env
# Editar .env con DATABASE_URL, AUTH_SECRET, etc.

npm install
npm run prisma:migrate:dev
npm run prisma:seed   # opcional; requiere ADMIN_EMAIL y ADMIN_PASSWORD
npm run dev
```

La app corre en `http://localhost:3000`. La ruta `/` muestra la landing pública;
el acceso al CRM cerrado se realiza por `/login`.

Para RLS en Postgres (recomendado en producción):

```bash
psql "$DATABASE_URL" -v crm_app_password='<password>' -f scripts/sql/setup-roles.sql
# Luego configurar TENANT_DATABASE_URL en .env
```

## Scripts principales

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `prisma generate` + build de producción |
| `npm run start` | Migraciones + servidor de producción |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run prisma:migrate:dev` | Migraciones en desarrollo |
| `npm run prisma:migrate:deploy` | Migraciones en producción |
| `npm run prisma:seed` | Seed de datos iniciales |
| `npm run prisma:studio` | Prisma Studio |
| `npm run test:observability` | Validación de forma del payload Observability |

Scripts adicionales en `scripts/`: `import-notion.ts`, `promote-superadmin.ts`,
`check-seed-data.ts`, `check-rls-coverage.ts`.

## Observability (costos de IA)

Opcional. Con estas env vars el CRM reporta cada ejecución de IA (agente,
reuniones, enriquecimiento, transcripción) a Observability en modo **single**
(`POST /api/v1/ingest/ai-event`). El reporte es best-effort y no afecta el
flujo principal.

```bash
OBSERVABILITY_BASE_URL="https://observ.zalantos.com"
OBSERVABILITY_API_KEY="..."
```

- `service_name`: `backend`
- `service_slug`: `crm-zalantos`

## Estructura del repositorio

```txt
src/
  app/              # Rutas Next.js (landing, dashboard, admin, API, auth)
  components/       # UI (Base UI/shadcn), landing y componentes de dominio
  hooks/            # React hooks
  lib/              # Lógica de negocio (auth, tenant, agent, meetings, CRM)
  types/            # Tipos globales
prisma/
  schema.prisma     # Modelo de datos
  migrations/       # Migraciones SQL
  seed.ts           # Seed
scripts/            # Utilidades CLI y SQL de setup
public/             # Assets estáticos
docs/               # Documentación Zalantos (ver mapa abajo)
templates/          # Plantillas de trabajo
```

## Mapa de documentación

| Documento | Contenido |
|-----------|-----------|
| [AGENTS.md](./AGENTS.md) | Reglas para agentes IA |
| [CLAUDE.md](./CLAUDE.md) | Instrucciones para Claude Code |
| [docs/context/context.md](./docs/context/context.md) | Contexto del proyecto |
| [docs/context/data_model_context.md](./docs/context/data_model_context.md) | Modelo de datos |
| [docs/architecture/architecture.md](./docs/architecture/architecture.md) | Arquitectura |
| [docs/architecture/integrations.md](./docs/architecture/integrations.md) | Integraciones externas |
| [docs/integrations/telegram-copiloto.md](./docs/integrations/telegram-copiloto.md) | Contrato Telegram ↔ n8n |
| [docs/engineering/](./docs/engineering/) | Estándares, seguridad, testing |
| [docs/operations/](./docs/operations/) | Deploy, variables, runbook |

## Estado del proyecto

- **Versión**: 0.1.0 (desarrollo activo)
- **Funcional**: CRM core, multi-tenancy, Meeting Intelligence, agente IA,
  canal Telegram (vía n8n), workflows, gateway de integraciones, RLS opcional.
- **Tests**: cobertura mínima (`npm run test:observability`); sin suite amplia
  (GAP documentado).

## Gaps conocidos

- GAP: documentación de despliegue en Railway no versionada en el repo.
- GAP: sin tests unitarios ni E2E en el repositorio.
- GAP: billing y facturación no implementados.
- GAP: contactos de responsables operativos (on-call).
