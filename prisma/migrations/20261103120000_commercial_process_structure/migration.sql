-- Rediseño del proceso comercial (HU-CRM-02) — migración ESTRUCTURAL.
-- Solo agrega tablas, columnas, índices, FKs, CHECKs y RLS. No transforma
-- datos: el backfill vive en 20261103120100_commercial_process_backfill.

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "commercialLeadId" TEXT,
ADD COLUMN     "commercialPartnerId" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalSource" TEXT;

-- AlterTable
ALTER TABLE "commercial_partners" ADD COLUMN     "agreementSignedAt" TIMESTAMP(3),
ADD COLUMN     "agreementTerms" TEXT,
ADD COLUMN     "allianceStage" TEXT,
ADD COLUMN     "allianceStageChangedAt" TIMESTAMP(3),
ADD COLUMN     "allianceStatus" TEXT NOT NULL DEFAULT 'open',
ADD COLUMN     "allianceStatusReason" TEXT,
ADD COLUMN     "allianceType" TEXT,
ADD COLUMN     "commercialPotential" TEXT,
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "nextStepActivityId" TEXT,
ADD COLUMN     "nextStepChannel" TEXT,
ADD COLUMN     "nextStepContext" TEXT,
ADD COLUMN     "nextStepDueDate" TIMESTAMP(3),
ADD COLUMN     "nextStepUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "potentialValue" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "inbound_leads" ADD COLUMN     "attributionId" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "commercialLeadId" TEXT,
ADD COLUMN     "commercialPartnerId" TEXT;

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "commercialLeadId" TEXT,
ADD COLUMN     "criticalEvent" TEXT,
ADD COLUMN     "criticalEventDate" TIMESTAMP(3),
ADD COLUMN     "decisionProcess" TEXT,
ADD COLUMN     "diagnosisDeliveredAt" TIMESTAMP(3),
ADD COLUMN     "expectedResponseAt" TIMESTAMP(3),
ADD COLUMN     "firstTouchAttributionId" TEXT,
ADD COLUMN     "impact" TEXT,
ADD COLUMN     "legacyStageKey" TEXT,
ADD COLUMN     "lossDetail" TEXT,
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "migrationReview" TEXT,
ADD COLUMN     "nextStepActivityId" TEXT,
ADD COLUMN     "nextStepChannel" TEXT,
ADD COLUMN     "nextStepContext" TEXT,
ADD COLUMN     "nextStepUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "proposalDecisionAt" TIMESTAMP(3),
ADD COLUMN     "proposalSentAt" TIMESTAMP(3),
ADD COLUMN     "reactivateAt" TIMESTAMP(3),
ADD COLUMN     "reactivationCriteria" TEXT,
ADD COLUMN     "recurringValue" DECIMAL(14,2),
ADD COLUMN     "situation" TEXT,
ADD COLUMN     "sprint0CompletedAt" TIMESTAMP(3),
ADD COLUMN     "sprint0ScheduledAt" TIMESTAMP(3),
ADD COLUMN     "sprint0Status" TEXT,
ADD COLUMN     "stageEnteredAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "wonAt" TIMESTAMP(3),
ADD COLUMN     "wonEvidence" TEXT;

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "configWarning" TEXT;

-- CreateTable
CREATE TABLE "commercial_leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyId" TEXT,
    "personId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "priority" TEXT,
    "ownerId" TEXT,
    "description" TEXT,
    "interestSignal" TEXT,
    "identifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstContactAt" TIMESTAMP(3),
    "becameLeadAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "disqualifiedAt" TIMESTAMP(3),
    "disqualificationReason" TEXT,
    "lastInteractionAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3),
    "nextStep" TEXT,
    "nextStepDueDate" TIMESTAMP(3),
    "nextStepChannel" TEXT,
    "nextStepContext" TEXT,
    "nextStepUpdatedAt" TIMESTAMP(3),
    "nextStepActivityId" TEXT,
    "firstTouchAttributionId" TEXT,
    "lastTouchAttributionId" TEXT,
    "inboundLeadId" TEXT,
    "legacyOpportunityId" TEXT,
    "createdById" TEXT,
    "createdVia" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_attributions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceChannel" TEXT NOT NULL,
    "campaignId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "landingPage" TEXT,
    "referrerUrl" TEXT,
    "referrerPersonId" TEXT,
    "referrerPartnerId" TEXT,
    "sourceDetail" TEXT,
    "touchedAt" TIMESTAMP(3),
    "method" TEXT NOT NULL DEFAULT 'manual',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdVia" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_stage_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "stageId" TEXT,
    "stageKey" TEXT NOT NULL,
    "stageLabel" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3),
    "exitedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_status_changes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT 'status',
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "commercial_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_partner_contacts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "commercialPartnerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rumbo_handoffs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payloadVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "projectName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "scopeSummary" TEXT,
    "responsibleUserId" TEXT,
    "requestedById" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "integrationDeliveryId" TEXT,
    "sentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "rumboProjectId" TEXT,
    "rumboProjectUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rumbo_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_leads_inboundLeadId_key" ON "commercial_leads"("inboundLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_leads_legacyOpportunityId_key" ON "commercial_leads"("legacyOpportunityId");

-- CreateIndex
CREATE INDEX "commercial_leads_organizationId_status_idx" ON "commercial_leads"("organizationId", "status");

-- CreateIndex
CREATE INDEX "commercial_leads_organizationId_ownerId_idx" ON "commercial_leads"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "commercial_leads_organizationId_identifiedAt_idx" ON "commercial_leads"("organizationId", "identifiedAt");

-- CreateIndex
CREATE INDEX "commercial_leads_companyId_idx" ON "commercial_leads"("companyId");

-- CreateIndex
CREATE INDEX "commercial_leads_personId_idx" ON "commercial_leads"("personId");

-- CreateIndex
CREATE INDEX "commercial_leads_nextStepDueDate_idx" ON "commercial_leads"("nextStepDueDate");

-- CreateIndex
CREATE INDEX "commercial_attributions_organizationId_sourceChannel_idx" ON "commercial_attributions"("organizationId", "sourceChannel");

-- CreateIndex
CREATE INDEX "commercial_attributions_organizationId_campaignId_idx" ON "commercial_attributions"("organizationId", "campaignId");

-- CreateIndex
CREATE INDEX "commercial_attributions_referrerPartnerId_idx" ON "commercial_attributions"("referrerPartnerId");

-- CreateIndex
CREATE INDEX "commercial_attributions_referrerPersonId_idx" ON "commercial_attributions"("referrerPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_organizationId_key_key" ON "campaigns"("organizationId", "key");

-- CreateIndex
CREATE INDEX "opportunity_stage_history_organizationId_opportunityId_idx" ON "opportunity_stage_history"("organizationId", "opportunityId");

-- CreateIndex
CREATE INDEX "opportunity_stage_history_organizationId_stageKey_enteredAt_idx" ON "opportunity_stage_history"("organizationId", "stageKey", "enteredAt");

-- CreateIndex
CREATE INDEX "commercial_status_changes_organizationId_entityType_entityI_idx" ON "commercial_status_changes"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "commercial_status_changes_organizationId_entityType_toValue_idx" ON "commercial_status_changes"("organizationId", "entityType", "toValue", "changedAt");

-- CreateIndex
CREATE INDEX "commercial_partner_contacts_organizationId_commercialPartne_idx" ON "commercial_partner_contacts"("organizationId", "commercialPartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_partner_contacts_commercialPartnerId_personId_key" ON "commercial_partner_contacts"("commercialPartnerId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "rumbo_handoffs_opportunityId_key" ON "rumbo_handoffs"("opportunityId");

-- CreateIndex
CREATE INDEX "rumbo_handoffs_organizationId_status_idx" ON "rumbo_handoffs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "activities_commercialLeadId_idx" ON "activities"("commercialLeadId");

-- CreateIndex
CREATE INDEX "activities_commercialPartnerId_idx" ON "activities"("commercialPartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "activities_organizationId_externalSource_externalId_key" ON "activities"("organizationId", "externalSource", "externalId");

-- CreateIndex
CREATE INDEX "commercial_partners_organizationId_allianceStage_idx" ON "commercial_partners"("organizationId", "allianceStage");

-- CreateIndex
CREATE INDEX "notes_commercialLeadId_idx" ON "notes"("commercialLeadId");

-- CreateIndex
CREATE INDEX "notes_commercialPartnerId_idx" ON "notes"("commercialPartnerId");

-- CreateIndex
CREATE INDEX "opportunities_organizationId_commercialLeadId_idx" ON "opportunities"("organizationId", "commercialLeadId");

-- CreateIndex
CREATE INDEX "opportunities_firstTouchAttributionId_idx" ON "opportunities"("firstTouchAttributionId");

-- CreateIndex
CREATE INDEX "opportunities_organizationId_reactivateAt_idx" ON "opportunities"("organizationId", "reactivateAt");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_commercialLeadId_fkey" FOREIGN KEY ("commercialLeadId") REFERENCES "commercial_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_firstTouchAttributionId_fkey" FOREIGN KEY ("firstTouchAttributionId") REFERENCES "commercial_attributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_nextStepActivityId_fkey" FOREIGN KEY ("nextStepActivityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_partners" ADD CONSTRAINT "commercial_partners_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_partners" ADD CONSTRAINT "commercial_partners_nextStepActivityId_fkey" FOREIGN KEY ("nextStepActivityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_nextStepActivityId_fkey" FOREIGN KEY ("nextStepActivityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_firstTouchAttributionId_fkey" FOREIGN KEY ("firstTouchAttributionId") REFERENCES "commercial_attributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_lastTouchAttributionId_fkey" FOREIGN KEY ("lastTouchAttributionId") REFERENCES "commercial_attributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_inboundLeadId_fkey" FOREIGN KEY ("inboundLeadId") REFERENCES "inbound_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_legacyOpportunityId_fkey" FOREIGN KEY ("legacyOpportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_attributions" ADD CONSTRAINT "commercial_attributions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_attributions" ADD CONSTRAINT "commercial_attributions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_attributions" ADD CONSTRAINT "commercial_attributions_referrerPersonId_fkey" FOREIGN KEY ("referrerPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_attributions" ADD CONSTRAINT "commercial_attributions_referrerPartnerId_fkey" FOREIGN KEY ("referrerPartnerId") REFERENCES "commercial_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_attributions" ADD CONSTRAINT "commercial_attributions_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_status_changes" ADD CONSTRAINT "commercial_status_changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_partner_contacts" ADD CONSTRAINT "commercial_partner_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_partner_contacts" ADD CONSTRAINT "commercial_partner_contacts_commercialPartnerId_fkey" FOREIGN KEY ("commercialPartnerId") REFERENCES "commercial_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_partner_contacts" ADD CONSTRAINT "commercial_partner_contacts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rumbo_handoffs" ADD CONSTRAINT "rumbo_handoffs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rumbo_handoffs" ADD CONSTRAINT "rumbo_handoffs_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rumbo_handoffs" ADD CONSTRAINT "rumbo_handoffs_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rumbo_handoffs" ADD CONSTRAINT "rumbo_handoffs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_commercialLeadId_fkey" FOREIGN KEY ("commercialLeadId") REFERENCES "commercial_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_commercialPartnerId_fkey" FOREIGN KEY ("commercialPartnerId") REFERENCES "commercial_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_commercialLeadId_fkey" FOREIGN KEY ("commercialLeadId") REFERENCES "commercial_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_commercialPartnerId_fkey" FOREIGN KEY ("commercialPartnerId") REFERENCES "commercial_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_leads" ADD CONSTRAINT "inbound_leads_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "commercial_attributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "commercial_offer_line_items_organizationId_commercialOfferId_id" RENAME TO "commercial_offer_line_items_organizationId_commercialOfferI_idx";

-- RenameIndex
ALTER INDEX "commercial_offer_profit_shares_offer_beneficiary_key" RENAME TO "commercial_offer_profit_shares_commercialOfferId_beneficiar_key";

-- RenameIndex
ALTER INDEX "commercial_offer_profit_shares_organizationId_commercialOfferId" RENAME TO "commercial_offer_profit_shares_organizationId_commercialOff_idx";

-- RenameIndex
ALTER INDEX "opportunity_commercial_partners_opportunityId_commercialPartner" RENAME TO "opportunity_commercial_partners_opportunityId_commercialPar_key";

-- RenameIndex
ALTER INDEX "opportunity_commercial_partners_organizationId_opportunityId_id" RENAME TO "opportunity_commercial_partners_organizationId_opportunityI_idx";


-- ---------------------------------------------------------------------------
-- Integridad de dominio (Prisma no modela CHECKs).
-- ---------------------------------------------------------------------------
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_status_check"
  CHECK ("status" IN ('prospect', 'contacted', 'lead', 'converted', 'disqualified'));
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_priority_check"
  CHECK ("priority" IS NULL OR "priority" IN ('low', 'medium', 'high'));
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_subject_check"
  CHECK ("companyId" IS NOT NULL OR "personId" IS NOT NULL OR "legacyOpportunityId" IS NOT NULL OR "inboundLeadId" IS NOT NULL);
ALTER TABLE "commercial_attributions" ADD CONSTRAINT "commercial_attributions_channel_check"
  CHECK ("sourceChannel" IN ('referral', 'campaign', 'web', 'linkedin_organic', 'outbound', 'event', 'partner', 'other'));
ALTER TABLE "commercial_partners" ADD CONSTRAINT "commercial_partners_alliance_stage_check"
  CHECK ("allianceStage" IS NULL OR "allianceStage" IN ('identified', 'contacted', 'exploration', 'negotiation', 'agreement', 'active'));
ALTER TABLE "commercial_partners" ADD CONSTRAINT "commercial_partners_alliance_status_check"
  CHECK ("allianceStatus" IN ('open', 'paused', 'discarded'));
ALTER TABLE "rumbo_handoffs" ADD CONSTRAINT "rumbo_handoffs_status_check"
  CHECK ("status" IN ('pending', 'sent', 'confirmed', 'failed'));
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_probability_check"
  CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100)) NOT VALID;

-- ---------------------------------------------------------------------------
-- RLS: segunda barrera de aislamiento, igual que el resto de tablas tenant.
-- ---------------------------------------------------------------------------
ALTER TABLE "commercial_leads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_leads" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "commercial_attributions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_attributions" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaigns" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "opportunity_stage_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "opportunity_stage_history" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "commercial_status_changes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_status_changes" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "commercial_partner_contacts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_partner_contacts" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
ALTER TABLE "rumbo_handoffs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "rumbo_handoffs" USING ("organizationId" = current_setting('app.current_org_id', true)) WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

-- El rol crm_app (TENANT_DATABASE_URL) necesita privilegios DML sobre las
-- tablas nuevas si no se configuraron default privileges (ver
-- scripts/sql/setup-roles.sql). Se otorgan solo si el rol existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "commercial_leads", "commercial_attributions", "campaigns",
      "opportunity_stage_history", "commercial_status_changes",
      "commercial_partner_contacts", "rumbo_handoffs"
    TO crm_app;
  END IF;
END $$;
