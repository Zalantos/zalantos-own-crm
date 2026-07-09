-- Entity context enrichment: sources + AI profile per CRM entity,
-- plus enrichment proposal context fields.

-- AlterTable
ALTER TABLE "crm_change_proposals" ADD COLUMN "personId" TEXT;
ALTER TABLE "crm_change_proposals" ADD COLUMN "contextSourceId" TEXT;

-- CreateIndex
CREATE INDEX "crm_change_proposals_contextSourceId_idx" ON "crm_change_proposals"("contextSourceId");
CREATE INDEX "crm_change_proposals_personId_idx" ON "crm_change_proposals"("personId");

-- CreateTable
CREATE TABLE "entity_context_sources" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'upload',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "extractedText" TEXT,
    "externalRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "processingError" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_context_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_context_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyFacts" JSONB NOT NULL,
    "topics" JSONB,
    "lastAnalyzedAt" TIMESTAMP(3) NOT NULL,
    "model" TEXT,
    "rawModelOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_context_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entity_context_sources_organizationId_entityType_entityId_idx" ON "entity_context_sources"("organizationId", "entityType", "entityId");
CREATE INDEX "entity_context_sources_organizationId_status_idx" ON "entity_context_sources"("organizationId", "status");

-- CreateIndex
CREATE INDEX "entity_context_profiles_organizationId_idx" ON "entity_context_profiles"("organizationId");
CREATE UNIQUE INDEX "entity_context_profiles_organizationId_entityType_entityId_key" ON "entity_context_profiles"("organizationId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "entity_context_sources" ADD CONSTRAINT "entity_context_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entity_context_profiles" ADD CONSTRAINT "entity_context_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (same tenant_isolation pattern as enable_row_level_security)
ALTER TABLE "entity_context_sources" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "entity_context_sources"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "entity_context_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "entity_context_profiles"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
