-- Multi-tenant foundation: crea Organization/PipelineStage/Invitation/PasswordResetToken,
-- agrega organizationId a todas las tablas y migra todos los datos existentes a la
-- organización Zalantos. Los usuarios ADMIN existentes quedan como super-admins del
-- software además de admins de Zalantos. El enum OpportunityStage se reemplaza por
-- la tabla pipeline_stages (etapas configurables por organización).

-- ========== 1. Tablas nuevas ==========

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
    "locale" TEXT NOT NULL DEFAULT 'es-CL',
    "brandName" TEXT,
    "logoUrl" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#0f766e',
    "integrationGatewayUrl" TEXT,
    "integrationGatewaySecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "color" TEXT,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- ========== 2. Organización Zalantos + etapas del pipeline actual ==========

INSERT INTO "organizations" ("id", "name", "slug", "updatedAt")
VALUES ('org_zalantos', 'Zalantos', 'zalantos', CURRENT_TIMESTAMP);

-- Ids determinísticos ('stage_zal_' || key) para poder mapear opportunities.stage
-- por SQL puro en el paso 4. Labels copiados de OPPORTUNITY_STAGE_LABELS.
INSERT INTO "pipeline_stages" ("id", "organizationId", "key", "label", "sortOrder", "isWon", "isLost", "updatedAt") VALUES
  ('stage_zal_lead_identificado',       'org_zalantos', 'lead_identificado',       'Lead identificado',       0,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_investigacion_realizada', 'org_zalantos', 'investigacion_realizada', 'Investigación realizada', 1,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_primer_contacto',         'org_zalantos', 'primer_contacto',         'Primer contacto',         2,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_reunion_discovery',       'org_zalantos', 'reunion_discovery',       'Reunión discovery',       3,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_dolor_validado',          'org_zalantos', 'dolor_validado',          'Dolor validado',          4,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_sprint_0_ofrecido',       'org_zalantos', 'sprint_0_ofrecido',       'Sprint 0 ofrecido',       5,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_sprint_0_aceptado',       'org_zalantos', 'sprint_0_aceptado',       'Sprint 0 aceptado',       6,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_diagnostico_realizado',   'org_zalantos', 'diagnostico_realizado',   'Diagnóstico realizado',   7,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_propuesta_principal',     'org_zalantos', 'propuesta_principal',     'Propuesta principal',     8,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_negociacion',             'org_zalantos', 'negociacion',             'Negociación',             9,  false, false, CURRENT_TIMESTAMP),
  ('stage_zal_ganado',                  'org_zalantos', 'ganado',                  'Ganado',                  10, true,  false, CURRENT_TIMESTAMP),
  ('stage_zal_perdido',                 'org_zalantos', 'perdido',                  'Perdido',                 11, false, true,  CURRENT_TIMESTAMP);

-- ========== 3. organizationId en todas las tablas (backfill a Zalantos) ==========

-- AlterTable
ALTER TABLE "activities" ADD COLUMN "organizationId" TEXT;
UPDATE "activities" SET "organizationId" = 'org_zalantos';
ALTER TABLE "activities" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "agent_attachments" ADD COLUMN "organizationId" TEXT;
UPDATE "agent_attachments" SET "organizationId" = 'org_zalantos';
ALTER TABLE "agent_attachments" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "agent_chat_messages" ADD COLUMN "organizationId" TEXT;
UPDATE "agent_chat_messages" SET "organizationId" = 'org_zalantos';
ALTER TABLE "agent_chat_messages" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "agent_chat_threads" ADD COLUMN "organizationId" TEXT;
UPDATE "agent_chat_threads" SET "organizationId" = 'org_zalantos';
ALTER TABLE "agent_chat_threads" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "organizationId" TEXT;
UPDATE "companies" SET "organizationId" = 'org_zalantos';
ALTER TABLE "companies" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "crm_change_items" ADD COLUMN "organizationId" TEXT;
UPDATE "crm_change_items" SET "organizationId" = 'org_zalantos';
ALTER TABLE "crm_change_items" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "crm_change_proposals" ADD COLUMN "organizationId" TEXT;
UPDATE "crm_change_proposals" SET "organizationId" = 'org_zalantos';
ALTER TABLE "crm_change_proposals" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "custom_field_definitions" ADD COLUMN "organizationId" TEXT;
UPDATE "custom_field_definitions" SET "organizationId" = 'org_zalantos';
ALTER TABLE "custom_field_definitions" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "custom_field_values" ADD COLUMN "organizationId" TEXT;
UPDATE "custom_field_values" SET "organizationId" = 'org_zalantos';
ALTER TABLE "custom_field_values" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN "organizationId" TEXT;
UPDATE "evidence" SET "organizationId" = 'org_zalantos';
ALTER TABLE "evidence" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "integration_deliveries" ADD COLUMN "organizationId" TEXT;
UPDATE "integration_deliveries" SET "organizationId" = 'org_zalantos';
ALTER TABLE "integration_deliveries" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN "organizationId" TEXT;
UPDATE "meetings" SET "organizationId" = 'org_zalantos';
ALTER TABLE "meetings" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "notes" ADD COLUMN "organizationId" TEXT;
UPDATE "notes" SET "organizationId" = 'org_zalantos';
ALTER TABLE "notes" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "people" ADD COLUMN "organizationId" TEXT;
UPDATE "people" SET "organizationId" = 'org_zalantos';
ALTER TABLE "people" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "saved_views" ADD COLUMN "createdById" TEXT,
ADD COLUMN "organizationId" TEXT;
UPDATE "saved_views" SET "organizationId" = 'org_zalantos';
ALTER TABLE "saved_views" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "team_members" ADD COLUMN "organizationId" TEXT;
UPDATE "team_members" SET "organizationId" = 'org_zalantos';
ALTER TABLE "team_members" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "timeline_events" ADD COLUMN "organizationId" TEXT;
UPDATE "timeline_events" SET "organizationId" = 'org_zalantos';
ALTER TABLE "timeline_events" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "workflow_logs" ADD COLUMN "organizationId" TEXT;
UPDATE "workflow_logs" SET "organizationId" = 'org_zalantos';
ALTER TABLE "workflow_logs" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN "organizationId" TEXT;
UPDATE "workflows" SET "organizationId" = 'org_zalantos';
ALTER TABLE "workflows" ALTER COLUMN "organizationId" SET NOT NULL;

-- Usuarios: todos pasan a la org Zalantos; los ADMIN existentes quedan además
-- como super-admins del software (admin global + admin de Zalantos).
ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "organizationId" TEXT;
UPDATE "users" SET "organizationId" = 'org_zalantos';
UPDATE "users" SET "isSuperAdmin" = true WHERE "role" = 'ADMIN';
-- organizationId puede ser NULL solo para super-admins (staff sin tenant).
ALTER TABLE "users" ADD CONSTRAINT "users_org_or_superadmin_check"
  CHECK ("isSuperAdmin" OR "organizationId" IS NOT NULL);

-- ========== 4. Opportunity: enum stage -> FK a pipeline_stages ==========

ALTER TABLE "opportunities" ADD COLUMN "organizationId" TEXT,
ADD COLUMN "stageId" TEXT;
UPDATE "opportunities" SET "organizationId" = 'org_zalantos';
UPDATE "opportunities" o
SET "stageId" = ps."id"
FROM "pipeline_stages" ps
WHERE ps."organizationId" = o."organizationId"
  AND ps."key" = o."stage"::text;
ALTER TABLE "opportunities" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "opportunities" ALTER COLUMN "stageId" SET NOT NULL;
ALTER TABLE "opportunities" DROP COLUMN "stage";

-- DropEnum
DROP TYPE "OpportunityStage";

-- ========== 5. Índices: drop de los reemplazados, creación de los nuevos ==========

-- DropIndex
DROP INDEX "activities_dueDate_idx";
DROP INDEX "activities_status_idx";
DROP INDEX "companies_name_idx";
DROP INDEX "companies_status_idx";
DROP INDEX "custom_field_definitions_entityType_fieldName_key";
DROP INDEX "custom_field_definitions_entityType_idx";
DROP INDEX "integration_deliveries_dedupeKey_key";
DROP INDEX "opportunities_status_idx";
DROP INDEX "saved_views_entityType_idx";
DROP INDEX "workflows_triggerEntity_triggerEvent_idx";

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "pipeline_stages_organizationId_idx" ON "pipeline_stages"("organizationId");
CREATE UNIQUE INDEX "pipeline_stages_organizationId_key_key" ON "pipeline_stages"("organizationId", "key");
CREATE UNIQUE INDEX "pipeline_stages_organizationId_sortOrder_key" ON "pipeline_stages"("organizationId", "sortOrder");
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");
CREATE INDEX "invitations_organizationId_email_idx" ON "invitations"("organizationId", "email");
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX "activities_organizationId_status_idx" ON "activities"("organizationId", "status");
CREATE INDEX "activities_organizationId_dueDate_idx" ON "activities"("organizationId", "dueDate");
CREATE INDEX "agent_attachments_organizationId_idx" ON "agent_attachments"("organizationId");
CREATE INDEX "agent_chat_messages_organizationId_idx" ON "agent_chat_messages"("organizationId");
CREATE INDEX "agent_chat_threads_organizationId_idx" ON "agent_chat_threads"("organizationId");
CREATE INDEX "companies_organizationId_name_idx" ON "companies"("organizationId", "name");
CREATE INDEX "companies_organizationId_status_idx" ON "companies"("organizationId", "status");
CREATE INDEX "crm_change_items_organizationId_idx" ON "crm_change_items"("organizationId");
CREATE INDEX "crm_change_proposals_organizationId_idx" ON "crm_change_proposals"("organizationId");
CREATE INDEX "custom_field_definitions_organizationId_entityType_idx" ON "custom_field_definitions"("organizationId", "entityType");
CREATE UNIQUE INDEX "custom_field_definitions_organizationId_entityType_fieldNam_key" ON "custom_field_definitions"("organizationId", "entityType", "fieldName");
CREATE INDEX "custom_field_values_organizationId_idx" ON "custom_field_values"("organizationId");
CREATE INDEX "evidence_organizationId_idx" ON "evidence"("organizationId");
CREATE UNIQUE INDEX "integration_deliveries_organizationId_dedupeKey_key" ON "integration_deliveries"("organizationId", "dedupeKey");
CREATE INDEX "meetings_organizationId_idx" ON "meetings"("organizationId");
CREATE INDEX "notes_organizationId_idx" ON "notes"("organizationId");
CREATE INDEX "opportunities_organizationId_stageId_idx" ON "opportunities"("organizationId", "stageId");
CREATE INDEX "opportunities_organizationId_status_idx" ON "opportunities"("organizationId", "status");
CREATE INDEX "people_organizationId_idx" ON "people"("organizationId");
CREATE INDEX "saved_views_organizationId_entityType_idx" ON "saved_views"("organizationId", "entityType");
CREATE INDEX "team_members_organizationId_idx" ON "team_members"("organizationId");
CREATE INDEX "timeline_events_organizationId_idx" ON "timeline_events"("organizationId");
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");
CREATE INDEX "workflow_logs_organizationId_idx" ON "workflow_logs"("organizationId");
CREATE INDEX "workflows_organizationId_triggerEntity_triggerEvent_idx" ON "workflows"("organizationId", "triggerEntity", "triggerEvent");

-- ========== 6. Foreign keys ==========

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companies" ADD CONSTRAINT "companies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "people" ADD CONSTRAINT "people_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_logs" ADD CONSTRAINT "workflow_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_change_proposals" ADD CONSTRAINT "crm_change_proposals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_change_items" ADD CONSTRAINT "crm_change_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_chat_threads" ADD CONSTRAINT "agent_chat_threads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_attachments" ADD CONSTRAINT "agent_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
