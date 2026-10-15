-- Responsable de la oportunidad y motivo de pérdida como enum.
CREATE TYPE "LossReason" AS ENUM (
  'PRICE',
  'CHOSE_COMPETITOR',
  'NO_BUDGET',
  'DEPRIORITIZED',
  'SOLVED_INTERNALLY',
  'CONTACT_OR_ORG_CHANGE',
  'NO_RESPONSE',
  'NOT_QUALIFIED',
  'OTHER'
);

-- El texto libre previo no es mapeable de forma fiable: cualquier valor
-- existente queda como OTHER.
ALTER TABLE "opportunities"
  ALTER COLUMN "lossReason" TYPE "LossReason"
  USING (CASE WHEN "lossReason" IS NULL THEN NULL ELSE 'OTHER'::"LossReason" END);

ALTER TABLE "opportunities" ADD COLUMN "ownerId" TEXT;

-- Backfill: el creador pasa a ser el responsable inicial.
UPDATE "opportunities" SET "ownerId" = "createdById" WHERE "createdById" IS NOT NULL;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "opportunities_ownerId_idx" ON "opportunities"("ownerId");
