-- Prevent concurrent proposal application and make contact identity canonical.

-- AlterEnum
ALTER TYPE "ProposalStatus" ADD VALUE 'applying';

-- AlterTable
ALTER TABLE "crm_change_proposals"
  ADD COLUMN "applyStartedAt" TIMESTAMP(3);

-- Backfill canonical person identity before enforcing email uniqueness.
UPDATE "people"
SET
  "email" = NULLIF(lower(trim("email")), ''),
  "firstName" = trim("firstName"),
  "lastName" = trim("lastName");

-- PostgreSQL allows multiple NULL values, so contacts without email remain valid.
CREATE UNIQUE INDEX "people_organizationId_email_key"
  ON "people"("organizationId", "email");
