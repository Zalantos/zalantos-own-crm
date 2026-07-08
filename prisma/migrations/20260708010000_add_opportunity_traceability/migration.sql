-- Lightweight opportunity traceability. Existing rows predate this metadata,
-- so they are marked as legacy and keep a nullable creator.

ALTER TABLE "opportunities" ADD COLUMN "createdById" TEXT;
ALTER TABLE "opportunities" ADD COLUMN "createdVia" TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX "opportunities_createdById_idx" ON "opportunities"("createdById");

ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "opportunities" ALTER COLUMN "createdVia" SET DEFAULT 'manual';
