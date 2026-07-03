-- CreateTable
-- Documents attached to agent chat threads. Purely additive.
CREATE TABLE "agent_attachments" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "extractedText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_attachments_threadId_idx" ON "agent_attachments"("threadId");
