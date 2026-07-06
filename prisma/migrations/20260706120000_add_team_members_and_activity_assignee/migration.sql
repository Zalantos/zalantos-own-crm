-- Team member catalog (admin-managed assignable people, optionally linked to a User)
-- and optional assignee on activities. Additive: existing activities stay unassigned.

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_members_userId_key" ON "team_members"("userId");

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "activities" ADD COLUMN "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "activities_assigneeId_idx" ON "activities"("assigneeId");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
