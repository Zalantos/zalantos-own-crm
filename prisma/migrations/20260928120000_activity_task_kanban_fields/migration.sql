-- Tablero Kanban de tareas: agrega columnas nuevas a "activities" y
-- remapea el vocabulario de status ("pending"/"completed") al de las 4
-- columnas del tablero ("todo"/"in_progress"/"blocked"/"done").
-- Additive-first: columnas nullable, backfill de datos existentes y recién
-- al final se ajusta el default de "status".

-- AlterTable
ALTER TABLE "activities" ADD COLUMN "plannedDate" TIMESTAMP(3);
ALTER TABLE "activities" ADD COLUMN "completedById" TEXT;
ALTER TABLE "activities" ADD COLUMN "blockedReason" TEXT;
ALTER TABLE "activities" ADD COLUMN "statusChangedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "activities_organizationId_plannedDate_idx" ON "activities"("organizationId", "plannedDate");
CREATE INDEX "activities_completedById_idx" ON "activities"("completedById");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "team_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: remapear el vocabulario de status existente
UPDATE "activities" SET "status" = 'todo' WHERE "status" = 'pending';
UPDATE "activities" SET "status" = 'done' WHERE "status" = 'completed';

-- Backfill: aproximar cuándo cambió de estado por última vez con la mejor
-- señal disponible hoy (fecha de completado si la tiene, si no la de
-- última actualización).
UPDATE "activities" SET "statusChangedAt" = COALESCE("completedAt", "updatedAt")
  WHERE "statusChangedAt" IS NULL;

-- Constrain: recién ahora que no quedan filas en "pending" se cambia el
-- default de la columna.
ALTER TABLE "activities" ALTER COLUMN "status" SET DEFAULT 'todo';
