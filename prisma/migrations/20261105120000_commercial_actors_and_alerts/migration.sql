-- Actores comerciales y alertas por etapa — migración ESTRUCTURAL.
-- Solo agrega tablas, índices, FKs, CHECKs y RLS; no elimina ni transforma
-- nada. Idempotente: se puede re-ejecutar sobre una base parcialmente migrada.
-- El backfill vive en 20261105120100_commercial_actors_alerts_backfill.

CREATE TABLE IF NOT EXISTS "commercial_actor_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "commercialLeadId" TEXT,
    "opportunityId" TEXT,
    "personId" TEXT,
    "companyId" TEXT,
    "commercialPartnerId" TEXT,
    "actorKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "description" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_actor_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_actor_links_one_target_check"
      CHECK (num_nonnulls("commercialLeadId", "opportunityId") = 1),
    CONSTRAINT "commercial_actor_links_one_actor_check"
      CHECK (num_nonnulls("personId", "companyId", "commercialPartnerId") = 1)
);

CREATE TABLE IF NOT EXISTS "commercial_alert_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "thresholdDays" INTEGER NOT NULL DEFAULT 0,
    "dayType" TEXT NOT NULL DEFAULT 'calendar',
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recipientType" TEXT NOT NULL DEFAULT 'owner',
    "recipientUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_alert_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_alert_rules_threshold_check" CHECK ("thresholdDays" >= 0)
);

CREATE TABLE IF NOT EXISTS "commercial_alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT,
    "commercialLeadId" TEXT,
    "opportunityId" TEXT,
    "pipeline" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "anchorAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "recipientUserId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_alerts_one_target_check"
      CHECK (num_nonnulls("commercialLeadId", "opportunityId") = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "commercial_actor_links_commercialLeadId_actorKey_key" ON "commercial_actor_links"("commercialLeadId", "actorKey");
CREATE UNIQUE INDEX IF NOT EXISTS "commercial_actor_links_opportunityId_actorKey_key" ON "commercial_actor_links"("opportunityId", "actorKey");
CREATE INDEX IF NOT EXISTS "commercial_actor_links_organizationId_actorKey_idx" ON "commercial_actor_links"("organizationId", "actorKey");
CREATE INDEX IF NOT EXISTS "commercial_actor_links_organizationId_opportunityId_idx" ON "commercial_actor_links"("organizationId", "opportunityId");
CREATE INDEX IF NOT EXISTS "commercial_actor_links_organizationId_commercialLeadId_idx" ON "commercial_actor_links"("organizationId", "commercialLeadId");
CREATE INDEX IF NOT EXISTS "commercial_actor_links_personId_idx" ON "commercial_actor_links"("personId");
CREATE INDEX IF NOT EXISTS "commercial_actor_links_companyId_idx" ON "commercial_actor_links"("companyId");
CREATE INDEX IF NOT EXISTS "commercial_actor_links_commercialPartnerId_idx" ON "commercial_actor_links"("commercialPartnerId");

CREATE UNIQUE INDEX IF NOT EXISTS "commercial_alert_rules_organizationId_pipeline_stageKey_con_key" ON "commercial_alert_rules"("organizationId", "pipeline", "stageKey", "condition");
CREATE INDEX IF NOT EXISTS "commercial_alert_rules_organizationId_isActive_idx" ON "commercial_alert_rules"("organizationId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "commercial_alerts_organizationId_dedupeKey_key" ON "commercial_alerts"("organizationId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "commercial_alerts_organizationId_status_idx" ON "commercial_alerts"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "commercial_alerts_organizationId_opportunityId_status_idx" ON "commercial_alerts"("organizationId", "opportunityId", "status");
CREATE INDEX IF NOT EXISTS "commercial_alerts_organizationId_commercialLeadId_status_idx" ON "commercial_alerts"("organizationId", "commercialLeadId", "status");
CREATE INDEX IF NOT EXISTS "commercial_alerts_organizationId_recipientUserId_status_idx" ON "commercial_alerts"("organizationId", "recipientUserId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_actor_links_organizationId_fkey') THEN
    ALTER TABLE "commercial_actor_links"
      ADD CONSTRAINT "commercial_actor_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_actor_links_commercialLeadId_fkey" FOREIGN KEY ("commercialLeadId") REFERENCES "commercial_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_actor_links_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_actor_links_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_actor_links_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_actor_links_commercialPartnerId_fkey" FOREIGN KEY ("commercialPartnerId") REFERENCES "commercial_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_actor_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_alert_rules_organizationId_fkey') THEN
    ALTER TABLE "commercial_alert_rules"
      ADD CONSTRAINT "commercial_alert_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_alert_rules_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_alerts_organizationId_fkey') THEN
    ALTER TABLE "commercial_alerts"
      ADD CONSTRAINT "commercial_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_alerts_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "commercial_alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_alerts_commercialLeadId_fkey" FOREIGN KEY ("commercialLeadId") REFERENCES "commercial_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_alerts_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT "commercial_alerts_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Aislamiento multi-tenant: misma política que el resto de tablas de tenant.
ALTER TABLE "commercial_actor_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_alert_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_alerts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "commercial_actor_links";
DROP POLICY IF EXISTS tenant_isolation ON "commercial_alert_rules";
DROP POLICY IF EXISTS tenant_isolation ON "commercial_alerts";
CREATE POLICY tenant_isolation ON "commercial_actor_links" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
CREATE POLICY tenant_isolation ON "commercial_alert_rules" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
CREATE POLICY tenant_isolation ON "commercial_alerts" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "commercial_actor_links", "commercial_alert_rules", "commercial_alerts"
    TO crm_app;
  END IF;
END $$;
