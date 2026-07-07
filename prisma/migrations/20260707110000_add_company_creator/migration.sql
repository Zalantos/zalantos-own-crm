-- Track which app user created each company. Existing companies stay without
-- a creator and remain deletable only by admins.

ALTER TABLE "companies" ADD COLUMN "createdById" TEXT;

CREATE INDEX "companies_createdById_idx" ON "companies"("createdById");

ALTER TABLE "companies" ADD CONSTRAINT "companies_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
