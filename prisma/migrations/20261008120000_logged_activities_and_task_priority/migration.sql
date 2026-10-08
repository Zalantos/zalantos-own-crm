-- Actividades registradas (llamada/email/visita ya ocurrida) y prioridad de
-- tareas para las herramientas MCP create_activity / create_task / list_tasks.
-- Solo aditiva: columnas nullable sin backfill, así que las filas existentes
-- quedan igual (occurredAt NULL = tarea, como hasta ahora).

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "occurredAt" TIMESTAMP(3),
ADD COLUMN     "outcomes" TEXT,
ADD COLUMN     "priority" TEXT;

-- CreateTable
CREATE TABLE "activity_people" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_people_organizationId_idx" ON "activity_people"("organizationId");

-- CreateIndex
CREATE INDEX "activity_people_personId_idx" ON "activity_people"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_people_activityId_personId_key" ON "activity_people"("activityId", "personId");

-- CreateIndex
CREATE INDEX "activities_organizationId_occurredAt_idx" ON "activities"("organizationId", "occurredAt");

-- AddForeignKey
ALTER TABLE "activity_people" ADD CONSTRAINT "activity_people_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_people" ADD CONSTRAINT "activity_people_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_people" ADD CONSTRAINT "activity_people_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segunda barrera de aislamiento, igual que el resto de tablas de tenant
-- (ver 20260708000000_enable_row_level_security).
ALTER TABLE "activity_people" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "activity_people"
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
