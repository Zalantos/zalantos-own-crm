# Almacenamiento y fuentes de conocimiento — CRM Zalantos

Estado tras retirar Meeting Intelligence (ver DEC-011) y preparación para la
fase pendiente de Wiki zalantos y SharePoint.

## Auditoría de S3/R2

| Uso | Clasificación | Resolución |
| --- | --- | --- |
| Evidencias de reuniones (`meetings/…`, `/api/evidence/presign`) | Exclusivo de Meeting Intelligence | Código retirado. Archivos y filas `evidence` conservados |
| Transcripción y análisis de evidencias | Exclusivo de Meeting Intelligence | Código retirado |
| Subida de documentos a fichas (`context/…`, `/api/entity-context/presign`) | Obsoleto | Retirada. Queda "Pegar texto", que no usa R2 |
| Borrado de objetos al eliminar una fuente de contexto | Obsoleto | Retirado: el CRM ya no borra archivos del bucket |
| Copia de adjuntos del chat (`agent/…`) | Obsoleto | Retirada: el agente solo usa `extractedText`, guardado en la base. Los adjuntos nuevos no se almacenan |
| Lectura de fuentes de contexto sin texto extraído | Se conserva | `getObjectBuffer`, solo para reintentar fuentes históricas pendientes |
| Documentos de ofertas | No usan R2 | Guardan `externalUrl` o referencian una fuente de contexto |

El CRM queda con **acceso de solo lectura a R2**, en un único punto:
`src/lib/storage/r2.ts`, llamado desde `src/lib/entity-context/pipeline.ts`.
Ninguna pantalla descarga originales; el texto histórico vive en la base.

**Cuándo retirar R2 por completo.** Comprobar en producción que no hay fuentes
pendientes sin texto:

```sql
SELECT count(*) FROM entity_context_sources
WHERE "storagePath" <> '' AND ("extractedText" IS NULL OR "extractedText" = '');
```

Con 0 filas se puede eliminar `src/lib/storage/r2.ts`, `@aws-sdk/client-s3` y
las variables `R2_*`. El bucket y sus archivos son una decisión aparte: requieren
una estrategia de conservación explícita.

## Datos históricos conservados

- `meetings`, `evidence`: filas intactas, incluidas transcripciones.
- `entity_context_sources`, `entity_context_profiles`, `agent_attachments`.
- `crm_change_proposals` con `source=meeting` y sus ítems.
- Archivos del bucket: sin cambios.

## Wiki zalantos y SharePoint

**Implementado** (ver DEC-014 y `docs/integrations/wiki-mcp.md`). El agente consulta
la documentación corporativa en su origen por MCP, sin duplicarla en el CRM.
SharePoint llega a través de la Wiki: el CRM no se conecta a él.

Las decisiones que estaban abiertas quedaron así: conexión vía MCP; una credencial compartida (token
de la Wiki o identidad de aplicación), no la de cada usuario; búsqueda propia de la Wiki, sin indexar en el CRM. Por usar
una credencial compartida, los permisos no se evalúan por usuario sino por organización.
