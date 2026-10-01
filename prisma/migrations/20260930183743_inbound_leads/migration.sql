-- CreateTable
CREATE TABLE "inbound_leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "company" TEXT,
    "message" TEXT,
    "page" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedCompanyId" TEXT,
    "convertedPersonId" TEXT,
    "convertedOpportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_leads_organizationId_status_idx" ON "inbound_leads"("organizationId", "status");

-- CreateIndex
CREATE INDEX "inbound_leads_organizationId_createdAt_idx" ON "inbound_leads"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_leads_organizationId_source_externalId_key" ON "inbound_leads"("organizationId", "source", "externalId");

-- AddForeignKey
ALTER TABLE "inbound_leads" ADD CONSTRAINT "inbound_leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_leads" ADD CONSTRAINT "inbound_leads_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_leads" ADD CONSTRAINT "inbound_leads_convertedCompanyId_fkey" FOREIGN KEY ("convertedCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_leads" ADD CONSTRAINT "inbound_leads_convertedPersonId_fkey" FOREIGN KEY ("convertedPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_leads" ADD CONSTRAINT "inbound_leads_convertedOpportunityId_fkey" FOREIGN KEY ("convertedOpportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
