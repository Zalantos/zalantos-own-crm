-- CreateTable
-- Agente IA (copiloto): chat threads + messages. Purely additive.
CREATE TABLE "agent_chat_threads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "contextType" "EntityType",
    "contextId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_chat_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_chat_threads_userId_updatedAt_idx" ON "agent_chat_threads"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "agent_chat_messages_threadId_createdAt_idx" ON "agent_chat_messages"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "agent_chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
