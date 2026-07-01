-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('lead_identificado', 'investigacion_realizada', 'primer_contacto', 'reunion_discovery', 'dolor_validado', 'sprint_0_ofrecido', 'sprint_0_aceptado', 'diagnostico_realizado', 'propuesta_principal', 'negociacion', 'ganado', 'perdido');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('company', 'person', 'opportunity', 'activity', 'note');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('text', 'number', 'boolean', 'date', 'select', 'multiselect');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "country" TEXT,
    "city" TEXT,
    "linkedinUrl" TEXT,
    "description" TEXT,
    "icpScore" INTEGER,
    "fitScore" INTEGER,
    "painScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "roleTitle" TEXT,
    "linkedinUrl" TEXT,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "isSponsor" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'lead_identificado',
    "estimatedValue" DECIMAL(14,2),
    "probability" INTEGER,
    "source" TEXT,
    "mainPain" TEXT,
    "urgency" TEXT,
    "decisionMakerId" TEXT,
    "sponsorId" TEXT,
    "nextStep" TEXT,
    "nextStepDueDate" TIMESTAMP(3),
    "expectedCloseDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "lossReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "personId" TEXT,
    "opportunityId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "personId" TEXT,
    "opportunityId" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "filtersJson" JSONB,
    "sortJson" JSONB,
    "visibleColumnsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL,
    "optionsJson" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,4),
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerEntity" "EntityType" NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "conditionsJson" JSONB NOT NULL,
    "actionsJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_logs" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "people_companyId_idx" ON "people"("companyId");

-- CreateIndex
CREATE INDEX "people_email_idx" ON "people"("email");

-- CreateIndex
CREATE INDEX "opportunities_companyId_idx" ON "opportunities"("companyId");

-- CreateIndex
CREATE INDEX "opportunities_stage_idx" ON "opportunities"("stage");

-- CreateIndex
CREATE INDEX "opportunities_status_idx" ON "opportunities"("status");

-- CreateIndex
CREATE INDEX "opportunities_nextStepDueDate_idx" ON "opportunities"("nextStepDueDate");

-- CreateIndex
CREATE INDEX "activities_companyId_idx" ON "activities"("companyId");

-- CreateIndex
CREATE INDEX "activities_personId_idx" ON "activities"("personId");

-- CreateIndex
CREATE INDEX "activities_opportunityId_idx" ON "activities"("opportunityId");

-- CreateIndex
CREATE INDEX "activities_status_idx" ON "activities"("status");

-- CreateIndex
CREATE INDEX "activities_dueDate_idx" ON "activities"("dueDate");

-- CreateIndex
CREATE INDEX "notes_companyId_idx" ON "notes"("companyId");

-- CreateIndex
CREATE INDEX "notes_personId_idx" ON "notes"("personId");

-- CreateIndex
CREATE INDEX "notes_opportunityId_idx" ON "notes"("opportunityId");

-- CreateIndex
CREATE INDEX "saved_views_entityType_idx" ON "saved_views"("entityType");

-- CreateIndex
CREATE INDEX "custom_field_definitions_entityType_idx" ON "custom_field_definitions"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_entityType_fieldName_key" ON "custom_field_definitions"("entityType", "fieldName");

-- CreateIndex
CREATE INDEX "custom_field_values_entityType_entityId_idx" ON "custom_field_values"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "custom_field_values_fieldDefinitionId_idx" ON "custom_field_values"("fieldDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_entityType_entityId_fieldDefinitionId_key" ON "custom_field_values"("entityType", "entityId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "workflows_triggerEntity_triggerEvent_idx" ON "workflows"("triggerEntity", "triggerEvent");

-- CreateIndex
CREATE INDEX "workflows_isActive_idx" ON "workflows"("isActive");

-- CreateIndex
CREATE INDEX "workflow_logs_workflowId_idx" ON "workflow_logs"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_logs_entityType_entityId_idx" ON "workflow_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_decisionMakerId_fkey" FOREIGN KEY ("decisionMakerId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_logs" ADD CONSTRAINT "workflow_logs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
