-- Segunda barrera de aislamiento para inbound_leads, igual que el resto de
-- tablas de tenant (ver 20260708000000_enable_row_level_security). Se separa
-- en su propia migración porque esa migración ya fue desplegada y no debe
-- editarse.

ALTER TABLE "inbound_leads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "inbound_leads"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
