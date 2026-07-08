-- Add evidence/citation, dedup pointer and revert bookkeeping to change items.
ALTER TABLE "crm_change_items"
  ADD COLUMN "evidence" TEXT,
  ADD COLUMN "duplicateOfId" TEXT,
  ADD COLUMN "revertData" JSONB,
  ADD COLUMN "revertedAt" TIMESTAMP(3);
