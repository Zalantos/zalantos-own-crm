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
**Estado:** active

**Contexto:** La IA no debe escribir directamente en entidades CRM sin supervisión.

**Decisión:** Flujo `CRMChangeProposal` → `CRMChangeItem` con estados, evidencia
textual, confianza y capacidad de revertir items aplicados.

**Alternativas consideradas:**

- Escritura directa por IA con log.
- Solo sugerencias en UI sin persistencia.

**Consecuencias:**

- UI de revisión en meetings y agente.
- Lógica de apply/revert en `src/lib/meeting-intelligence/apply.ts`.

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
  `process-evidence`).

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
sin acoplarlo a Meeting Intelligence, y dejando abierta la puerta a LinkedIn u
otras fuentes externas.

**Decisión:**

1. Modelo `EntityContextSource` polimórfico (`entityType` + `entityId`) con
   `sourceType` string (`upload`, `linkedin`, `url`, …).
2. Perfil consolidado `EntityContextProfile` (summary, keyFacts, topics) visible
   en la ficha.
3. Política híbrida: perfil + nota de contexto se escriben automático; cambios a
   campos CRM van por `CRMChangeProposal` con `source=enrichment` (siempre
   pending, sin auto-aprobación).
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
4. Confirmación de propuestas pequeñas por tool `confirm_pending_proposal`;
   propuestas grandes → revisión web.

**Alternativas consideradas:**

- Bot Telegram nativo dentro de Next.js.
- Memoria conversacional solo en n8n.
- Aprobar cualquier tamaño de propuesta por chat.

**Consecuencias:**

- Contrato documentado en `docs/integrations/telegram-copiloto.md`.
- Workflow n8n queda fuera del repo (GAP operativo).
- Misma secret que el gateway saliente autentica el canal entrante.

---

## GAP: decisiones por documentar

- Elección de Groq como proveedor por defecto de transcripción y razonamiento.
- Elección de Cloudflare R2 vs S3.
- Estrategia de despliegue Railway (réplicas, crons).
