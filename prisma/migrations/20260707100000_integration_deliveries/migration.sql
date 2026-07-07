-- Integration gateway delivery log for idempotency, audit, and retries.

-- CreateTable
CREATE TABLE "integration_deliveries" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "recipientJson" JSONB NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerResponseJson" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_deliveries_dedupeKey_key" ON "integration_deliveries"("dedupeKey");

-- CreateIndex
CREATE INDEX "integration_deliveries_status_idx" ON "integration_deliveries"("status");

-- CreateIndex
CREATE INDEX "integration_deliveries_type_idx" ON "integration_deliveries"("type");

-- CreateIndex
CREATE INDEX "integration_deliveries_channel_idx" ON "integration_deliveries"("channel");

-- CreateIndex
CREATE INDEX "integration_deliveries_entityType_entityId_idx" ON "integration_deliveries"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "integration_deliveries_createdAt_idx" ON "integration_deliveries"("createdAt");
