-- Canal Telegram ↔ Copiloto CRM: vínculo chat↔usuario y códigos de un solo uso.
-- n8n resuelve tenant/usuario por telegramChatId (vía prismaSystem, owner exento
-- de RLS); la UI admin gestiona estos registros scopeada por org (forOrg), por eso
-- llevan organizationId y política RLS tenant_isolation.

-- CreateTable
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "agentThreadId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_codes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_telegramChatId_key" ON "telegram_links"("telegramChatId");
CREATE INDEX "telegram_links_organizationId_idx" ON "telegram_links"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_codes_code_key" ON "telegram_link_codes"("code");
CREATE INDEX "telegram_link_codes_organizationId_idx" ON "telegram_link_codes"("organizationId");

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (same tenant_isolation pattern as enable_row_level_security)
ALTER TABLE "telegram_links" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "telegram_links"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

ALTER TABLE "telegram_link_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "telegram_link_codes"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
