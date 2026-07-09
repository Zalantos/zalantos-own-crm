import {
  buildCompanySnapshot,
  snapshotCustomFields,
} from "@/lib/agent/snapshot";
import type { TenantClient } from "@/lib/tenant";
import type { ContextEntityType } from "@/lib/entity-context/types";

// Compact CRM state for the enrichment LLM, scoped to the target entity.
export async function buildEntityContextSnapshot(
  db: TenantClient,
  entityType: ContextEntityType,
  entityId: string,
) {
  const existingProfile = await db.entityContextProfile.findFirst({
    where: { entityType, entityId },
    select: {
      summary: true,
      keyFacts: true,
      topics: true,
      lastAnalyzedAt: true,
    },
  });

  const sources = await db.entityContextSource.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      filename: true,
      sourceType: true,
      status: true,
      externalRef: true,
      createdAt: true,
    },
  });

  const profileBlock = existingProfile
    ? {
        summary: existingProfile.summary,
        keyFacts: existingProfile.keyFacts,
        topics: existingProfile.topics,
        lastAnalyzedAt: existingProfile.lastAnalyzedAt.toISOString(),
      }
    : null;

  if (entityType === "company") {
    const companySnapshot = await buildCompanySnapshot(db, entityId);
    return {
      entityType,
      entityId,
      ...companySnapshot,
      contextProfile: profileBlock,
      contextSources: sources,
    };
  }

  if (entityType === "person") {
    const person = await db.person.findUnique({
      where: { id: entityId },
      include: {
        company: {
          select: { id: true, name: true, industry: true, description: true },
        },
      },
    });
    if (!person) throw new Error(`Persona no encontrada: ${entityId}`);
    const customFields = await snapshotCustomFields(db, "person", entityId);
    const notes = await db.note.findMany({
      where: { personId: entityId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { title: true, body: true },
    });
    return {
      entityType,
      entityId,
      person: {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
        roleTitle: person.roleTitle,
        linkedinUrl: person.linkedinUrl,
        isDecisionMaker: person.isDecisionMaker,
        isSponsor: person.isSponsor,
        notes: person.notes,
        companyId: person.companyId,
        company: person.company,
        customFields,
      },
      recentNotes: notes,
      contextProfile: profileBlock,
      contextSources: sources,
    };
  }

  const opportunity = await db.opportunity.findUnique({
    where: { id: entityId },
    include: {
      company: {
        select: { id: true, name: true, industry: true, description: true },
      },
      stage: { select: { key: true, label: true } },
      decisionMaker: {
        select: { id: true, firstName: true, lastName: true, roleTitle: true },
      },
      sponsor: {
        select: { id: true, firstName: true, lastName: true, roleTitle: true },
      },
    },
  });
  if (!opportunity) throw new Error(`Oportunidad no encontrada: ${entityId}`);
  const customFields = await snapshotCustomFields(db, "opportunity", entityId);
  const notes = await db.note.findMany({
    where: { opportunityId: entityId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { title: true, body: true },
  });
  return {
    entityType,
    entityId,
    opportunity: {
      id: opportunity.id,
      name: opportunity.name,
      stage: opportunity.stage.key,
      stageLabel: opportunity.stage.label,
      status: opportunity.status,
      mainPain: opportunity.mainPain,
      urgency: opportunity.urgency,
      nextStep: opportunity.nextStep,
      nextStepDueDate: opportunity.nextStepDueDate?.toISOString() ?? null,
      expectedCloseDate: opportunity.expectedCloseDate?.toISOString() ?? null,
      probability: opportunity.probability,
      estimatedValue: opportunity.estimatedValue?.toString() ?? null,
      source: opportunity.source,
      companyId: opportunity.companyId,
      company: opportunity.company,
      decisionMaker: opportunity.decisionMaker,
      sponsor: opportunity.sponsor,
      customFields,
    },
    recentNotes: notes,
    contextProfile: profileBlock,
    contextSources: sources,
  };
}
