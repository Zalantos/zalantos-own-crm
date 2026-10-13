-- Extend the existing proposal tables into the AI change ledger. This is
-- additive: pending legacy proposals remain pending and are never auto-applied.
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'partially_applied';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'partially_reverted';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'reverted';

ALTER TABLE "crm_change_proposals"
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "initiatedBy" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "crm_change_items"
  ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sequence" INTEGER,
  ADD COLUMN "appliedSnapshot" JSONB,
  ADD COLUMN "undoExpiresAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "failureMessage" TEXT,
  ADD COLUMN "revertedBy" TEXT,
  ADD COLUMN "causedByItemId" TEXT;

UPDATE "crm_change_proposals"
SET "channel" = CASE
  WHEN "source" = 'meeting' THEN 'meeting'
  WHEN "source" = 'enrichment' THEN 'enrichment'
  WHEN "source" = 'agent' AND "model" = 'mcp' THEN 'mcp'
  ELSE 'legacy'
END;

UPDATE "crm_change_items"
SET "undoExpiresAt" = "appliedAt" + INTERVAL '90 days'
WHERE "appliedAt" IS NOT NULL AND "undoExpiresAt" IS NULL;

CREATE INDEX "crm_change_proposals_organizationId_channel_createdAt_idx"
  ON "crm_change_proposals"("organizationId", "channel", "createdAt");
CREATE INDEX "crm_change_proposals_initiatedBy_idx"
  ON "crm_change_proposals"("initiatedBy");
CREATE INDEX "crm_change_items_causedByItemId_idx"
  ON "crm_change_items"("causedByItemId");
CREATE INDEX "crm_change_items_undoExpiresAt_idx"
  ON "crm_change_items"("undoExpiresAt");

ALTER TABLE "crm_change_items"
  ADD CONSTRAINT "crm_change_items_causedByItemId_fkey"
  FOREIGN KEY ("causedByItemId") REFERENCES "crm_change_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- No new tenant table is introduced. The existing tenant_isolation policies on
-- crm_change_proposals and crm_change_items cover every added column.
