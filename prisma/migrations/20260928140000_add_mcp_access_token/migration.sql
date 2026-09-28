-- CreateTable
CREATE TABLE "mcp_access_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "agentThreadId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_access_tokens_tokenHash_key" ON "mcp_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_access_tokens_organizationId_idx" ON "mcp_access_tokens"("organizationId");

-- AddForeignKey
ALTER TABLE "mcp_access_tokens" ADD CONSTRAINT "mcp_access_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EnableRLS
ALTER TABLE "mcp_access_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "mcp_access_tokens"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
