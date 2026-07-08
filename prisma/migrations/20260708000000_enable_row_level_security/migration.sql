-- Habilita Row Level Security como segunda barrera de aislamiento
-- multi-tenant, además del filtro a nivel de aplicación (forOrg() en
-- src/lib/tenant.ts). Requiere que exista el rol `crm_app` (ver
-- scripts/sql/setup-roles.sql, que debe correrse ANTES de aplicar esta
-- migración) — el rol dueño de las tablas (el que corre esta migración,
-- ej. postgres) queda automáticamente exento de RLS por ser el owner.
--
-- Política: `organization_id = current_setting('app.current_org_id', true)`.
-- current_setting(..., true) devuelve NULL si la variable no fue seteada en
-- la sesión/transacción, y NULL = cualquier cosa es NULL (no TRUE) en SQL,
-- así que sin `app.current_org_id` seteado la política deniega todo por
-- default (deny-by-default). Los ids son cuid TEXT, por eso no hay cast a
-- uuid.
--
-- NO se usa FORCE ROW LEVEL SECURITY: el rol dueño (migraciones, superadmin,
-- auth, crons — ver prismaSystem en src/lib/prisma.ts) necesita cruzar
-- organizaciones libremente.
--
-- La tabla `organizations` queda sin RLS a propósito: el código de tenant
-- (forOrg) tiene prohibido tocarla en runtime y crm_app no tiene grants
-- sobre ella (ver setup-roles.sql), así que ninguna capa necesita una
-- política ahí.

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "companies"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "people"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "opportunities"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "activities"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notes"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "saved_views"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "custom_field_definitions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "custom_field_definitions"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "custom_field_values" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "custom_field_values"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "pipeline_stages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pipeline_stages"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "workflows"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "workflow_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "workflow_logs"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "integration_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "integration_deliveries"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "team_members"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "meetings"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "evidence"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "crm_change_proposals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "crm_change_proposals"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "crm_change_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "crm_change_items"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "agent_chat_threads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_chat_threads"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "agent_chat_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_chat_messages"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "agent_attachments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_attachments"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "timeline_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "timeline_events"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

-- users, invitations y password_reset_tokens tienen organizationId NULLABLE
-- (super-admins sin tenant). NULL = valor siempre da NULL (no TRUE), así que
-- estas filas quedan automáticamente ocultas para cualquier sesión con
-- app.current_org_id seteado — correcto: el código de tenant nunca debería
-- ver cuentas de super-admin puro.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitations"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "password_reset_tokens"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
