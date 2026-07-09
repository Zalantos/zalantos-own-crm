-- Creation traceability for CRM core records. Existing rows predate this
-- metadata, so they are marked as legacy and keep a nullable creator.

ALTER TABLE "companies" ADD COLUMN "createdVia" TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE "people" ADD COLUMN "createdById" TEXT;
ALTER TABLE "people" ADD COLUMN "createdVia" TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE "activities" ADD COLUMN "createdById" TEXT;
ALTER TABLE "activities" ADD COLUMN "createdVia" TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE "notes" ADD COLUMN "createdById" TEXT;
ALTER TABLE "notes" ADD COLUMN "createdVia" TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX "people_createdById_idx" ON "people"("createdById");
CREATE INDEX "activities_createdById_idx" ON "activities"("createdById");
CREATE INDEX "notes_createdById_idx" ON "notes"("createdById");

ALTER TABLE "people" ADD CONSTRAINT "people_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "activities" ADD CONSTRAINT "activities_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notes" ADD CONSTRAINT "notes_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "companies" ALTER COLUMN "createdVia" SET DEFAULT 'manual';
ALTER TABLE "people" ALTER COLUMN "createdVia" SET DEFAULT 'manual';
ALTER TABLE "activities" ALTER COLUMN "createdVia" SET DEFAULT 'manual';
ALTER TABLE "notes" ALTER COLUMN "createdVia" SET DEFAULT 'manual';
