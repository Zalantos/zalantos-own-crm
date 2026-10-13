-- Personas multiempresa, partners y ofertas comerciales.
-- Migración expansiva: conserva people.companyId/roleTitle como compatibilidad.

CREATE TABLE "person_company_relationships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roles" TEXT[] NOT NULL DEFAULT ARRAY['contact']::TEXT[],
    "roleTitle" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "person_company_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_partners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'external',
    "linkedCompanyId" TEXT,
    "linkedPersonId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commercial_partners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_partners_kind_check" CHECK ("kind" IN ('company', 'person', 'external')),
    CONSTRAINT "commercial_partners_link_check" CHECK (
      ("kind" = 'company' AND "linkedCompanyId" IS NOT NULL AND "linkedPersonId" IS NULL) OR
      ("kind" = 'person' AND "linkedPersonId" IS NOT NULL AND "linkedCompanyId" IS NULL) OR
      ("kind" = 'external' AND "linkedCompanyId" IS NULL AND "linkedPersonId" IS NULL)
    )
);

CREATE TABLE "company_commercial_partners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "commercialPartnerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "defaultProfitSharePercentage" DECIMAL(5,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_commercial_partners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_commercial_partners_share_check" CHECK (
      "defaultProfitSharePercentage" IS NULL OR
      ("defaultProfitSharePercentage" >= 0 AND "defaultProfitSharePercentage" <= 100)
    )
);

CREATE TABLE "opportunity_commercial_partners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "commercialPartnerId" TEXT NOT NULL,
    "companyCommercialPartnerId" TEXT,
    "role" TEXT NOT NULL,
    "profitSharePercentage" DECIMAL(5,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "opportunity_commercial_partners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "opportunity_commercial_partners_share_check" CHECK (
      "profitSharePercentage" IS NULL OR
      ("profitSharePercentage" >= 0 AND "profitSharePercentage" <= 100)
    )
);

CREATE TABLE "commercial_offers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "offerorName" TEXT NOT NULL,
    "presenterTeamMemberId" TEXT,
    "presenterNameSnapshot" TEXT,
    "productName" TEXT,
    "sentAt" TIMESTAMP(3),
    "validBusinessDays" INTEGER,
    "validUntil" TIMESTAMP(3),
    "pricingUnit" TEXT NOT NULL DEFAULT 'CLP',
    "plusVat" BOOLEAN NOT NULL DEFAULT true,
    "exchangeRateToClp" DECIMAL(18,6),
    "exchangeRateDate" TIMESTAMP(3),
    "exchangeRateSource" TEXT,
    "executiveSummary" TEXT,
    "painSummary" TEXT,
    "solutionSummary" TEXT,
    "implementationPlan" TEXT,
    "outOfScope" TEXT,
    "commercialTerms" TEXT,
    "risks" TEXT,
    "nextSteps" TEXT,
    "economicScope" TEXT,
    "economicScopeLabel" TEXT,
    "economicBaseNetAmount" DECIMAL(18,4),
    "projectCostAmount" DECIMAL(18,4),
    "distributableProfitAmount" DECIMAL(18,4),
    "createdVia" TEXT NOT NULL DEFAULT 'manual',
    "createdById" TEXT,
    "sourceFingerprint" TEXT,
    "sourceRefs" JSONB,
    "extractionConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commercial_offers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_offers_status_check" CHECK ("status" IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded')),
    CONSTRAINT "commercial_offers_scope_check" CHECK ("economicScope" IS NULL OR "economicScope" IN ('implementation', 'first_year', 'custom')),
    CONSTRAINT "commercial_offers_validity_check" CHECK ("validBusinessDays" IS NULL OR "validBusinessDays" > 0),
    CONSTRAINT "commercial_offers_amounts_nonnegative_check" CHECK (
      ("economicBaseNetAmount" IS NULL OR "economicBaseNetAmount" >= 0) AND
      ("projectCostAmount" IS NULL OR "projectCostAmount" >= 0) AND
      ("distributableProfitAmount" IS NULL OR "distributableProfitAmount" >= 0) AND
      ("exchangeRateToClp" IS NULL OR "exchangeRateToClp" > 0)
    ),
    CONSTRAINT "commercial_offers_economics_check" CHECK (
      "economicBaseNetAmount" IS NULL OR
      "projectCostAmount" IS NULL OR
      "distributableProfitAmount" IS NULL OR
      "economicBaseNetAmount" = "projectCostAmount" + "distributableProfitAmount"
    )
);

CREATE TABLE "commercial_offer_line_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "commercialOfferId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "amount" DECIMAL(18,4) NOT NULL,
    "pricingUnit" TEXT NOT NULL,
    "frequency" TEXT,
    "startMonth" INTEGER,
    "endMonth" INTEGER,
    "billingTrigger" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commercial_offer_line_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_offer_line_items_amount_check" CHECK ("amount" >= 0 AND ("quantity" IS NULL OR "quantity" >= 0)),
    CONSTRAINT "commercial_offer_line_items_month_check" CHECK (
      ("startMonth" IS NULL OR "startMonth" >= 1) AND
      ("endMonth" IS NULL OR "endMonth" >= 1) AND
      ("startMonth" IS NULL OR "endMonth" IS NULL OR "endMonth" >= "startMonth")
    )
);

CREATE TABLE "commercial_offer_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "commercialOfferId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" TEXT,
    "externalUrl" TEXT,
    "entityContextSourceId" TEXT,
    "versionLabel" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commercial_offer_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_offer_profit_shares" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "commercialOfferId" TEXT NOT NULL,
    "beneficiaryType" TEXT NOT NULL,
    "commercialPartnerId" TEXT,
    "beneficiaryNameSnapshot" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commercial_offer_profit_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_offer_profit_shares_beneficiary_check" CHECK (
      ("beneficiaryType" = 'organization' AND "commercialPartnerId" IS NULL) OR
      ("beneficiaryType" = 'partner' AND "commercialPartnerId" IS NOT NULL)
    ),
    CONSTRAINT "commercial_offer_profit_shares_percentage_check" CHECK ("percentage" >= 0 AND "percentage" <= 100),
    CONSTRAINT "commercial_offer_profit_shares_amount_check" CHECK ("amount" >= 0)
);

CREATE TABLE "business_holidays" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "person_company_relationships_personId_companyId_key" ON "person_company_relationships"("personId", "companyId");
CREATE UNIQUE INDEX "person_company_relationships_one_primary_active" ON "person_company_relationships"("personId") WHERE "isPrimary" = true AND "endedAt" IS NULL;
CREATE INDEX "person_company_relationships_organizationId_companyId_idx" ON "person_company_relationships"("organizationId", "companyId");
CREATE INDEX "person_company_relationships_organizationId_personId_idx" ON "person_company_relationships"("organizationId", "personId");
CREATE INDEX "commercial_partners_organizationId_isActive_idx" ON "commercial_partners"("organizationId", "isActive");
CREATE INDEX "commercial_partners_linkedCompanyId_idx" ON "commercial_partners"("linkedCompanyId");
CREATE INDEX "commercial_partners_linkedPersonId_idx" ON "commercial_partners"("linkedPersonId");
CREATE UNIQUE INDEX "company_commercial_partners_companyId_commercialPartnerId_key" ON "company_commercial_partners"("companyId", "commercialPartnerId");
CREATE INDEX "company_commercial_partners_organizationId_companyId_idx" ON "company_commercial_partners"("organizationId", "companyId");
CREATE INDEX "company_commercial_partners_commercialPartnerId_idx" ON "company_commercial_partners"("commercialPartnerId");
CREATE UNIQUE INDEX "opportunity_commercial_partners_opportunityId_commercialPartnerId_key" ON "opportunity_commercial_partners"("opportunityId", "commercialPartnerId");
CREATE INDEX "opportunity_commercial_partners_organizationId_opportunityId_idx" ON "opportunity_commercial_partners"("organizationId", "opportunityId");
CREATE INDEX "opportunity_commercial_partners_commercialPartnerId_idx" ON "opportunity_commercial_partners"("commercialPartnerId");
CREATE UNIQUE INDEX "commercial_offers_opportunityId_versionNumber_key" ON "commercial_offers"("opportunityId", "versionNumber");
CREATE UNIQUE INDEX "commercial_offers_organizationId_sourceFingerprint_key" ON "commercial_offers"("organizationId", "sourceFingerprint");
CREATE INDEX "commercial_offers_organizationId_status_idx" ON "commercial_offers"("organizationId", "status");
CREATE INDEX "commercial_offers_opportunityId_versionNumber_idx" ON "commercial_offers"("opportunityId", "versionNumber");
CREATE INDEX "commercial_offers_validUntil_idx" ON "commercial_offers"("validUntil");
CREATE INDEX "commercial_offers_createdById_idx" ON "commercial_offers"("createdById");
CREATE INDEX "commercial_offer_line_items_organizationId_commercialOfferId_idx" ON "commercial_offer_line_items"("organizationId", "commercialOfferId");
CREATE INDEX "commercial_offer_documents_organizationId_commercialOfferId_idx" ON "commercial_offer_documents"("organizationId", "commercialOfferId");
CREATE INDEX "commercial_offer_documents_entityContextSourceId_idx" ON "commercial_offer_documents"("entityContextSourceId");
CREATE UNIQUE INDEX "commercial_offer_profit_shares_offer_beneficiary_key" ON "commercial_offer_profit_shares"("commercialOfferId", "beneficiaryType", "commercialPartnerId");
CREATE UNIQUE INDEX "commercial_offer_profit_shares_one_organization" ON "commercial_offer_profit_shares"("commercialOfferId") WHERE "beneficiaryType" = 'organization';
CREATE INDEX "commercial_offer_profit_shares_organizationId_commercialOfferId_idx" ON "commercial_offer_profit_shares"("organizationId", "commercialOfferId");
CREATE INDEX "commercial_offer_profit_shares_commercialPartnerId_idx" ON "commercial_offer_profit_shares"("commercialPartnerId");
CREATE UNIQUE INDEX "business_holidays_organizationId_date_key" ON "business_holidays"("organizationId", "date");
CREATE INDEX "business_holidays_organizationId_date_idx" ON "business_holidays"("organizationId", "date");

ALTER TABLE "person_company_relationships" ADD CONSTRAINT "person_company_relationships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "person_company_relationships" ADD CONSTRAINT "person_company_relationships_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_company_relationships" ADD CONSTRAINT "person_company_relationships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_partners" ADD CONSTRAINT "commercial_partners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_partners" ADD CONSTRAINT "commercial_partners_linkedCompanyId_fkey" FOREIGN KEY ("linkedCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_partners" ADD CONSTRAINT "commercial_partners_linkedPersonId_fkey" FOREIGN KEY ("linkedPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_commercial_partners" ADD CONSTRAINT "company_commercial_partners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_commercial_partners" ADD CONSTRAINT "company_commercial_partners_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_commercial_partners" ADD CONSTRAINT "company_commercial_partners_commercialPartnerId_fkey" FOREIGN KEY ("commercialPartnerId") REFERENCES "commercial_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opportunity_commercial_partners" ADD CONSTRAINT "opportunity_commercial_partners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_commercial_partners" ADD CONSTRAINT "opportunity_commercial_partners_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opportunity_commercial_partners" ADD CONSTRAINT "opportunity_commercial_partners_commercialPartnerId_fkey" FOREIGN KEY ("commercialPartnerId") REFERENCES "commercial_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opportunity_commercial_partners" ADD CONSTRAINT "opportunity_commercial_partners_companyCommercialPartnerId_fkey" FOREIGN KEY ("companyCommercialPartnerId") REFERENCES "company_commercial_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_presenterTeamMemberId_fkey" FOREIGN KEY ("presenterTeamMemberId") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_offer_line_items" ADD CONSTRAINT "commercial_offer_line_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_offer_line_items" ADD CONSTRAINT "commercial_offer_line_items_commercialOfferId_fkey" FOREIGN KEY ("commercialOfferId") REFERENCES "commercial_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_offer_documents" ADD CONSTRAINT "commercial_offer_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_offer_documents" ADD CONSTRAINT "commercial_offer_documents_commercialOfferId_fkey" FOREIGN KEY ("commercialOfferId") REFERENCES "commercial_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_offer_documents" ADD CONSTRAINT "commercial_offer_documents_entityContextSourceId_fkey" FOREIGN KEY ("entityContextSourceId") REFERENCES "entity_context_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_offer_profit_shares" ADD CONSTRAINT "commercial_offer_profit_shares_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_offer_profit_shares" ADD CONSTRAINT "commercial_offer_profit_shares_commercialOfferId_fkey" FOREIGN KEY ("commercialOfferId") REFERENCES "commercial_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_offer_profit_shares" ADD CONSTRAINT "commercial_offer_profit_shares_commercialPartnerId_fkey" FOREIGN KEY ("commercialPartnerId") REFERENCES "commercial_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_holidays" ADD CONSTRAINT "business_holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Relación principal heredada de people.companyId.
INSERT INTO "person_company_relationships" (
  "id", "organizationId", "personId", "companyId", "roles", "roleTitle",
  "isPrimary", "startedAt", "createdAt", "updatedAt"
)
SELECT
  'pcr_' || md5(p."id" || ':' || p."companyId"),
  p."organizationId", p."id", p."companyId", ARRAY['contact']::TEXT[],
  p."roleTitle", true, p."createdAt", p."createdAt", p."updatedAt"
FROM "people" p
WHERE p."companyId" IS NOT NULL
ON CONFLICT ("personId", "companyId") DO NOTHING;

-- Relaciones adicionales inferidas únicamente de decisor/sponsor en una
-- oportunidad de otra empresa. El rol específico sigue viviendo en Opportunity.
WITH inferred AS (
  SELECT o."organizationId", o."decisionMakerId" AS "personId", o."companyId"
  FROM "opportunities" o
  WHERE o."decisionMakerId" IS NOT NULL
  UNION
  SELECT o."organizationId", o."sponsorId" AS "personId", o."companyId"
  FROM "opportunities" o
  WHERE o."sponsorId" IS NOT NULL
)
INSERT INTO "person_company_relationships" (
  "id", "organizationId", "personId", "companyId", "roles", "isPrimary",
  "startedAt", "createdAt", "updatedAt"
)
SELECT
  'pcr_' || md5(i."personId" || ':' || i."companyId"),
  i."organizationId", i."personId", i."companyId", ARRAY['contact']::TEXT[],
  false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM inferred i
JOIN "people" p ON p."id" = i."personId" AND p."organizationId" = i."organizationId"
JOIN "companies" c ON c."id" = i."companyId" AND c."organizationId" = i."organizationId"
ON CONFLICT ("personId", "companyId") DO NOTHING;

-- Segunda barrera multi-tenant para todas las tablas nuevas.
ALTER TABLE "person_company_relationships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "person_company_relationships" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "commercial_partners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_partners" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "company_commercial_partners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "company_commercial_partners" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "opportunity_commercial_partners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "opportunity_commercial_partners" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "commercial_offers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_offers" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "commercial_offer_line_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_offer_line_items" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "commercial_offer_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_offer_documents" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "commercial_offer_profit_shares" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_offer_profit_shares" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "business_holidays" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "business_holidays" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
