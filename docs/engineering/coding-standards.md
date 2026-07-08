# Estándares de código — CRM Zalantos

Stack: TypeScript, Next.js 16, React 19, Prisma 7, Tailwind 4, Zod 4.

## Naming

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Archivos/directorios | kebab-case | `proposal-actions.ts` |
| Variables/funciones | camelCase | `requireOrgContext` |
| Tipos/componentes | PascalCase | `ChangeProposalReview` |
| Props de componentes | sufijo `Props` | `AgentPanelProps` |
| Constantes | SCREAMING_SNAKE_CASE | `CRON_SECRET` |

**Sin abreviaciones** en nombres de variables (`organization`, no `org` en
nombres nuevos; `orgId` aceptado como parámetro establecido).

## Estructura de carpetas

```txt
src/app/(dashboard)/<entidad>/   # Páginas + actions.ts + forms
src/components/shared/<dominio>/ # Componentes reutilizables
src/components/ui/               # shadcn primitives
src/lib/<dominio>/               # Lógica de negocio
src/lib/zod/                     # Schemas de validación
```

## Imports

1. Librerías externas
2. `@/` (alias interno)
3. Relativos

## Exports

- **Named exports** únicamente (no default exports).

## Componentes React

- Functional components only.
- Preferir event handlers sobre `useEffect` para actualizaciones de estado.
- Server Components por defecto; `"use client"` solo cuando hace falta.

## Server Actions y API

- Validar input con Zod al inicio.
- Usar `requireOrgContext()` o `auth()` según el caso.
- Retornar errores legibles al cliente.

## Error handling

```typescript
// Errores de negocio con mensajes claros
if (!entity) {
  throw new Error('Entidad no encontrada');
}
```

Helpers Prisma: `src/lib/prisma-errors.ts`.

## Validación

- Schemas Zod en `src/lib/zod/`.
- Reutilizar en forms (react-hook-form + `@hookform/resolvers`).

## Logging

- `console.error` para errores en server; evitar loguear PII.
- GAP: logger estructurado no implementado.

## Tipos

- `type` sobre `interface` (salvo extensión de terceros).
- Sin `any`.
- Tipos de Prisma generados automáticamente.

## Servicios / lib

- Lógica de dominio en `src/lib/`, no en componentes.
- Funciones pequeñas y enfocadas.

## Migraciones

- Generar con `npm run prisma:migrate:dev`.
- Nunca reescribir migraciones ya desplegadas.
- SQL manual solo en `scripts/sql/` para setup de roles (no Prisma).

## Variables de entorno

- Leer en tiempo de uso (patrón lazy en configs).
- Documentar en `.env.example` y `docs/operations/env-vars.md`.
- Nunca commitear `.env`.

## Formato

- Prettier: 2 espacios, comillas simples, trailing commas, ancho 80.
- ESLint con `eslint-config-next`.

```bash
npm run format
npm run lint
```

## Commits

- Mensajes concisos en español o inglés (consistencia del equipo).
- Un propósito por commit.

## Pull requests

Usar `.github/pull_request_template.md`.
