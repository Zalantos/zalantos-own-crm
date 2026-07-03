-- Decouple CRMChangeProposal from Meeting so the AI agent can create
-- proposals from chat. Additive + backfill in the same migration.

-- AlterTable
ALTER TABLE "crm_change_proposals" ALTER COLUMN "meetingId" DROP NOT NULL;
ALTER TABLE "crm_change_proposals" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'meeting';
ALTER TABLE "crm_change_proposals" ADD COLUMN "companyId" TEXT;
ALTER TABLE "crm_change_proposals" ADD COLUMN "opportunityId" TEXT;
ALTER TABLE "crm_change_proposals" ADD COLUMN "chatThreadId" TEXT;
ALTER TABLE "crm_change_proposals" ADD COLUMN "chatMessageId" TEXT;

-- Backfill company/opportunity context from the originating meeting.
UPDATE "crm_change_proposals" p
SET "companyId" = m."companyId",
    "opportunityId" = m."opportunityId"
FROM "meetings" m
WHERE p."meetingId" = m."id";

-- CreateIndex
CREATE INDEX "crm_change_proposals_chatThreadId_idx" ON "crm_change_proposals"("chatThreadId");
