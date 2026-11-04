-- Vínculo opcional con el client_id de la Wiki. Columna nullable y sin backfill:
-- Postgres trata los NULL como distintos, así que el índice único no afecta a las
-- empresas sin vincular.
ALTER TABLE "companies" ADD COLUMN "wikiClientId" TEXT;

CREATE UNIQUE INDEX "companies_organizationId_wikiClientId_key" ON "companies"("organizationId", "wikiClientId");
