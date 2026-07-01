-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('pending', 'extracting', 'transcribing', 'analyzing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('pending', 'approved', 'rejected', 'partially_approved', 'applied');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'meeting';

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "meetingType" TEXT NOT NULL DEFAULT 'discovery',
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "rawTranscript" TEXT,
    "aiSummary" JSONB,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'pending',
    "processingError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "extractedText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_change_proposals" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'pending',
    "model" TEXT,
    "rawModelOutput" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_change_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_change_items" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "crm_change_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "actorId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meetings_companyId_idx" ON "meetings"("companyId");

-- CreateIndex
CREATE INDEX "meetings_opportunityId_idx" ON "meetings"("opportunityId");

-- CreateIndex
CREATE INDEX "meetings_processingStatus_idx" ON "meetings"("processingStatus");

-- CreateIndex
CREATE INDEX "evidence_meetingId_idx" ON "evidence"("meetingId");

-- CreateIndex
CREATE INDEX "crm_change_proposals_meetingId_idx" ON "crm_change_proposals"("meetingId");

-- CreateIndex
CREATE INDEX "crm_change_proposals_status_idx" ON "crm_change_proposals"("status");

-- CreateIndex
CREATE INDEX "crm_change_items_proposalId_idx" ON "crm_change_items"("proposalId");

-- CreateIndex
CREATE INDEX "timeline_events_companyId_occurredAt_idx" ON "timeline_events"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "timeline_events_opportunityId_idx" ON "timeline_events"("opportunityId");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_change_proposals" ADD CONSTRAINT "crm_change_proposals_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_change_items" ADD CONSTRAINT "crm_change_items_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "crm_change_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
