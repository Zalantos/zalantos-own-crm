# Decisiones de arquitectura — CRM Zalantos

## DEC-001 — Multi-tenancy con filtro de aplicación + RLS opcional

**Fecha:** 2026-07-07 (migración `multi_tenant_foundation`, `enable_row_level_security`)  
**Estado:** active

**Contexto:** El CRM sirve múltiples organizaciones en una sola base de datos.
Se requiere aislamiento fuerte entre tenants.

**Decisión:** Dos capas de aislamiento:

1. Cliente Prisma tenant (`forOrg`) que inyecta `organizationId` en todas las
   operaciones.
2. RLS de Postgres activada cuando `TENANT_DATABASE_URL` apunta al rol
   `crm_app` (NOBYPASSRLS).

**Alternativas consideradas:**

- Solo RLS sin filtro de app.
- Base de datos por tenant.
- Schema por tenant en Postgres.

**Consecuencias:**

- Setup manual de roles SQL por entorno.
- Costo de una transacción por operación tenant bajo RLS.
- Pool dimensionado (`TENANT_DB_POOL_MAX`).

---

## DEC-002 — Etapas de pipeline como entidad configurable

**Fecha:** 2026-07-01 (inicio del proyecto)  
**Estado:** active

**Contexto:** Cada organización puede tener etapas de venta distintas.

**Decisión:** Modelo `PipelineStage` con `key` estable (slug) en lugar de enum
fijo `OpportunityStage`.

**Alternativas consideradas:**

- Enum global de etapas.
- JSON de configuración sin tabla.

**Consecuencias:**

- Agente y webhooks referencian `key`, no `id`.
- Etapas con oportunidades se desactivan (`isActive`) en lugar de borrarse.

---

## DEC-003 — Propuestas de cambio CRM con revisión humana

**Fecha:** 2026-07-01 (`meeting_intelligence`)  
**Estado:** superseded por DEC-009

**Contexto:** La IA no debe escribir directamente en entidades CRM sin supervisión.

**Decisión:** Flujo `CRMChangeProposal` → `CRMChangeItem` con estados, evidencia
textual, confianza y capacidad de revertir items aplicados.

**Alternativas consideradas:**

- Escritura directa por IA con log.
- Solo sugerencias en UI sin persistencia.

**Consecuencias:**

- UI de revisión en meetings y agente.
- Lógica de apply/revert en `src/lib/ai-changes/apply.ts`.

---

## DEC-009 — Ejecución directa de IA con trazabilidad reversible

**Fecha:** 2026-10-09 (`ai_change_traceability`)
**Estado:** active

**Contexto:** La aprobación previa de toda mutación convirtió la bandeja en un
cuello de botella. El producto adopta confianza operativa en la IA, manteniendo
una salida segura ante errores.

**Decisión:**

1. Toda mutación no destructiva de web, Telegram, MCP, reuniones o
   enriquecimiento se registra y ejecuta inmediatamente por ítem.
2. `CRMChangeProposal` y `CRMChangeItem` son la bitácora única. Baja confianza,
   fallos y pendientes destructivos se destacan en Actividad de IA.
3. Los cambios aplicados se pueden deshacer durante 90 días sólo si los campos
   o registros siguen intactos; el lote se prevalida completo y se revierte en
   orden inverso.
4. Sólo eliminaciones y fusiones que hagan desaparecer datos requieren
   aprobación previa del solicitante o un `ADMIN`.
5. Efectos internos de workflows se enlazan al cambio causante. Efectos externos
   no se consideran reversibles en esta fase.

**Consecuencias:**

- `/agent/proposals` conserva su URL pero pasa a ser Actividad de IA org-wide.
- Los lotes pueden quedar parcialmente aplicados; un fallo no revierte hermanos.
- Las propuestas pendientes existentes no se autoaplican.
- La reversión evita sobrescribir ediciones posteriores y nunca borra en cascada.

---

## DEC-004 — Gateway único de integraciones externas

**Fecha:** 2026-07-07 (`integration_deliveries`)  
**Estado:** active

**Contexto:** Enviar emails, Slack, etc. sin acoplar proveedores en el CRM.

**Decisión:** Webhook HTTP único (`INTEGRATION_GATEWAY_URL`) con secret;
dedupe y auditoría en `IntegrationDelivery`. Override por organización.

**Alternativas consideradas:**

- Integrar SendGrid/Resend directamente en el CRM.
- Un webhook por tipo de integración.

**Consecuencias:**

- n8n (u otro) implementa canales.
- Secretos por org cifrados con AES-256-GCM.

---

## DEC-005 — Monolito Next.js sin worker separado

**Fecha:** 2026-07-01  
**Estado:** active

**Contexto:** Equipo pequeño, despliegue simple en Railway.

**Decisión:** Pipeline de meetings y crons como Route Handlers HTTP en el mismo
proceso Next.js.

**Alternativas consideradas:**

- Worker BullMQ + Redis.
- Funciones serverless separadas.

**Consecuencias:**

- Crons dependen de scheduler externo y `CRON_SECRET`.
- Reinicio del servidor puede dejar meetings atascados (mitigado por cron
  `process-entity-context`).

---

## DEC-006 — Auth por credenciales (email/password)

**Fecha:** 2026-07-01  
**Estado:** active

**Contexto:** Usuarios B2B internos; sin requisito de SSO en v1.

**Decisión:** Auth.js Credentials + bcrypt; invitaciones por token.

**Alternativas consideradas:**

- OAuth Google/Microsoft.
- Magic links.

**Consecuencias:**

- Flujos de invite y reset-password propios.
- Super-admins pueden existir sin `organizationId`.

---

## DEC-007 — Context sources polimórficas (enriquecimiento de entidad)

**Fecha:** 2026-07-09  
**Estado:** active

**Contexto:** Se necesita más contexto en fichas de empresa/persona/oportunidad
sin acoplarlo a otros flujos, y dejando abierta la puerta a LinkedIn u
otras fuentes externas.

**Decisión:**

1. Modelo `EntityContextSource` polimórfico (`entityType` + `entityId`) con
   `sourceType` string (`upload`, `linkedin`, `url`, …).
2. Perfil consolidado `EntityContextProfile` (summary, keyFacts, topics) visible
   en la ficha.
3. Perfil + nota de contexto se escriben automáticamente. Desde DEC-009, los
   campos CRM también se aplican de inmediato y quedan trazados en
   `CRMChangeProposal(source=enrichment, channel=enrichment)`.
4. Conectores externos futuros solo normalizan a texto/metadata y crean un
   `EntityContextSource`; el pipeline de análisis es el mismo.

**Alternativas consideradas:**

- Reutilizar solo adjuntos del agente (sin persistencia en ficha).
- Extender `Evidence` de meetings a entidades CRM.
- Auto-aplicar campos de perfil con umbral de confianza.

**Consecuencias:**

- Tab Contexto en fichas + módulo `src/lib/entity-context/`.
- Cron catch-up `/api/cron/process-entity-context`.
- LinkedIn/OAuth queda fuera del MVP; el schema ya admite `sourceType=linkedin`.

---

## DEC-008 — Telegram como canal del copiloto vía n8n

**Fecha:** 2026-07-15 (`add_telegram_link`)  
**Estado:** active

**Contexto:** Usuarios comerciales necesitan consultar/actualizar el CRM desde
Telegram sin sesión web. No se quiere acoplar el Bot API dentro del monolito.

**Decisión:**

1. n8n recibe Telegram (texto/voz) y llama a `/api/telegram/*` con Bearer
   `INTEGRATION_GATEWAY_SECRET`.
2. Vínculo permanente `TelegramLink` (`telegramChatId` ↔ `userId` + org) y
   códigos efímeros `TelegramLinkCode`.
3. Memoria conversacional en `AgentChatThread` (no buffer de n8n).
4. Ejecución directa de cambios no destructivos; `confirm_pending_proposal`
   queda para acciones destructivas y propuestas legacy, sin límite de tamaño.

**Alternativas consideradas:**

- Bot Telegram nativo dentro de Next.js.
- Memoria conversacional solo en n8n.
- Mantener aprobación previa para toda mutación.

**Consecuencias:**

- Contrato documentado en `docs/integrations/telegram-copiloto.md`.
- Workflow n8n queda fuera del repo (GAP operativo).
- Misma secret que el gateway saliente autentica el canal entrante.

---

## DEC-010 — Un solo pipeline; partners como actores

**Estado:** aceptada.

**Decisión.** Se elimina el pipeline de alianzas. Toda oportunidad usa el mismo
pipeline y los partners participan como actores (`CommercialActorLink`), junto a
personas y empresas. `/partners` queda como directorio.

**Consecuencias.** La participación económica sigue separada en
`OpportunityCommercialPartner` y las ofertas: vincular no asigna comisión. El
decisor y sponsor persona siguen en `Opportunity` para no duplicar el dato. Las
columnas `alliance*` se conservan como histórico.

## DEC-011 — Retiro de Meeting Intelligence

**Estado:** aceptada.

**Decisión.** Se retira la subida de evidencia, transcripción, análisis y cambios
automáticos desde reuniones. Las reuniones comerciales pasan a ser
`Activity(type=meeting)`. El motor de bitácora IA, usado también por agente y
enriquecimiento, se mueve a `src/lib/ai-changes/`.

**Consecuencias.** `meetings` y `evidence` quedan como histórico sin flujo activo:
se conservan y sus filas se copiaron a `activities`. Las transcripciones ya no son
accesibles desde UI ni agente. El dictado del copiloto
(`/api/portal/voice/*`) no es parte de esta función y se mantiene.

## DEC-012 — Alertas por reglas de etapa sin motor nuevo

**Estado:** aceptada.

**Decisión.** Reglas por etapa en base de datos, evaluadas de forma determinística
en el cron comercial existente y al abrir fichas. Se reutilizan workflows, timeline
y gateway; no se crea un motor de automatización.

**Consecuencias.** La deduplicación por período evita recordatorios diarios. Los
tableros muestran lo último sincronizado, así que la frecuencia del cron define su
frescura. La detección funciona sin IA.

## DEC-013 — Enriquecimiento sin subida de archivos

**Estado:** aceptada; reversible.

**Decisión.** Se retira la subida de documentos a R2 en fichas y se mantiene "Pegar
texto". Los adjuntos del agente dejan de copiarse a R2. La documentación corporativa
se consultará en su origen (`docs/architecture/knowledge-sources.md`).

**Consecuencias.** El CRM deja de escribir en R2. Quien necesite analizar un PDF debe
pegar su texto o adjuntarlo al chat del agente, que extrae el texto sin almacenarlo.

## DEC-014 — Wiki corporativa por MCP con credencial compartida

**Estado:** aceptada.

**Decisión.** El agente consulta la Wiki por MCP con un token de la Wiki
(`WIKI_MCP_TOKEN`), o con client credentials de Entra si no está definido, y una lista
blanca de dos herramientas de lectura. El acceso se decide en el CRM por
organización (`WIKI_MCP_ALLOWED_ORG_IDS`, apagado por defecto). Si en un turno entró
contenido de la Wiki, las acciones comerciales críticas exigen confirmación en un
turno nuevo, por código y no solo por prompt. El texto recuperado no se persiste.

**Consecuencias.** Sin login interactivo ni ACL por usuario: todo usuario autorizado
ve lo que ve la credencial. Un token personal además caduca, depende de su dueño y
tiene permisos de escritura que el CRM no usa. Pedir "leé el documento y cerrá el negocio" requiere dos
mensajes. Releer un documento en otro turno cuesta una llamada a la Wiki. Ver
`docs/integrations/wiki-mcp.md`.

## GAP: decisiones por documentar

- Elección de Groq como proveedor por defecto de transcripción y razonamiento.
- Estrategia de despliegue Railway (réplicas, crons).
