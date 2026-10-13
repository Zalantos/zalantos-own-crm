# HU-CRM-01 — Partners, ofertas y personas multiempresa

## Objetivo

Implementar relaciones persona–empresa N:M, partners comerciales, ofertas
versionadas con rentabilidad proyectada y un backfill revisable para todas las
oportunidades existentes.

## Criterios de aceptación

- Una persona puede relacionarse con varias empresas, varios roles y una sola
  relación principal activa.
- Los partners tienen un porcentaje por defecto en empresa y un snapshot
  editable en oportunidad.
- Cada oportunidad puede tener ofertas versionadas con partidas, documentos,
  costo, utilidad y reparto de utilidad.
- `costo + utilidad = precio neto` y los porcentajes de reparto suman 100%.
- La vigencia excluye fines de semana y feriados configurados por organización.
- El backfill procesa todas las oportunidades sin inventar costo, utilidad ni
  partners sin evidencia.
- Las tablas nuevas están aisladas por tenant mediante `forOrg` y RLS.

## Checklist técnico

- [x] BD / modelos Prisma, migración aditiva, backfill de relaciones y RLS
- [x] Backend / validaciones, transacciones y cálculos compartidos
- [x] Frontend / personas multiempresa, partners y ofertas
- [x] Agente / MCP / consultas existentes compatibles con N:M
- [x] Backfill comercial dry-run + apply idempotente
- [x] Tests, lint y build
- [x] Documentación y evidencia final

## Evidencia

- Migración aditiva: `20261013120000_commercial_data_partners` (no aplicada
  automáticamente al entorno compartido).
- Dry-run real de `org_zalantos`: 20 resultados; 1 `ready`, 14
  `needs_review`, 5 `no_source`, 0 `error`. Ningún ítem quedó marcado como
  revisado y no se ejecutó `--apply`.
- `npx prisma validate`: OK.
- `npm run test:commercial`: 8/8.
- `npm run test:inbound-leads`: 18/18.
- `npm run test:contact-dedup`: 12/12.
- `npm run test:mcp-tools`: 39/39.
- `npm run lint`: 0 errores; permanece 1 warning preexistente en
  `src/lib/agent/tools/web-search.ts`.
- `npm run build`: OK; 49 páginas generadas.
- `npm run format:check`: el repo ya contenía 82 archivos fuera de formato;
  los archivos tocados por esta HU fueron formateados sin ampliar ese alcance.
