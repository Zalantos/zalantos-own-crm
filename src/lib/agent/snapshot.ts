import { CUSTOM_FIELD_PREFIX } from "@/lib/agent/field-registry";
import { mergeCustomFields } from "@/lib/custom-fields/merge";
import type { EntityType } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";

// Compact, serializable view of one company that the model reasons against.
// Kept bounded on purpose (recent records only) to control token cost.
// Extracted from the Meeting Intelligence snapshot so chat and pipeline share it.
export async function buildCompanySnapshot(
  db: TenantClient,
  companyId: string,
  options: { excludeMeetingId?: string } = {},
) {
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error(`Empresa no encontrada: ${companyId}`);

  const [
    opportunities,
    people,
    notes,
    activities,
    priorMeetings,
    customFields,
    contextProfile,
    contextSources,
  ] = await Promise.all([
    db.opportunity.findMany({
      where: { companyId },
      include: {
        stage: { select: { key: true, label: true } },
        commercialPartners: {
          include: {
            commercialPartner: { select: { id: true, displayName: true } },
          },
        },
        commercialOffers: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: { profitShares: true },
        },
      },
    }),
    db.person.findMany({
      where: {
        OR: [{ companyId }, { companyRelationships: { some: { companyId } } }],
      },
      include: {
        companyRelationships: {
          include: { company: { select: { id: true, name: true } } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
    }),
    db.note.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.activity.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.meeting.findMany({
      where: {
        companyId,
        ...(options.excludeMeetingId
          ? { id: { not: options.excludeMeetingId } }
          : {}),
        processingStatus: "ready",
      },
      orderBy: { meetingDate: "desc" },
      take: 5,
      select: { id: true, title: true, meetingDate: true, aiSummary: true },
    }),
    snapshotCustomFields(db, "company", companyId),
    db.entityContextProfile.findFirst({
      where: { entityType: "company", entityId: companyId },
      select: {
        summary: true,
        keyFacts: true,
        topics: true,
        lastAnalyzedAt: true,
      },
    }),
    db.entityContextSource.findMany({
      where: { entityType: "company", entityId: companyId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        filename: true,
        sourceType: true,
        status: true,
        externalRef: true,
      },
    }),
  ]);

  return {
    company: {
      id: company.id,
      name: company.name,
      website: company.website,
      linkedinUrl: company.linkedinUrl,
      industry: company.industry,
      size: company.size,
      country: company.country,
      city: company.city,
      description: company.description,
      painScore: company.painScore,
      icpScore: company.icpScore,
      fitScore: company.fitScore,
      status: company.status,
      source: company.source,
      priority: company.priority,
      mainPain: company.mainPain,
      productInterest: company.productInterest,
      potentialValue: company.potentialValue?.toString() ?? null,
      buyingTiming: company.buyingTiming,
      urgency: company.urgency,
      competitor: company.competitor,
      currentProvider: company.currentProvider,
      nextStep: company.nextStep,
      nextStepDueDate: company.nextStepDueDate?.toISOString() ?? null,
      lastContactAt: company.lastContactAt?.toISOString() ?? null,
      customFields,
    },
    opportunities: opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      // `stage` es el key de la etapa (coincide con list_writable_fields).
      stage: o.stage.key,
      stageLabel: o.stage.label,
      status: o.status,
      mainPain: o.mainPain,
      urgency: o.urgency,
      nextStep: o.nextStep,
      nextStepDueDate: o.nextStepDueDate?.toISOString() ?? null,
      expectedCloseDate: o.expectedCloseDate?.toISOString() ?? null,
      probability: o.probability,
      estimatedValue: o.estimatedValue?.toString() ?? null,
      decisionMakerId: o.decisionMakerId,
      sponsorId: o.sponsorId,
      commercialPartners: (o.commercialPartners ?? []).map((assignment) => ({
        id: assignment.commercialPartner.id,
        name: assignment.commercialPartner.displayName,
        role: assignment.role,
        profitSharePercentage:
          assignment.profitSharePercentage?.toString() ?? null,
      })),
      currentOffer: o.commercialOffers?.[0]
        ? {
            id: o.commercialOffers[0].id,
            versionNumber: o.commercialOffers[0].versionNumber,
            status: o.commercialOffers[0].status,
            pricingUnit: o.commercialOffers[0].pricingUnit,
            economicScope: o.commercialOffers[0].economicScope,
            economicBaseNetAmount:
              o.commercialOffers[0].economicBaseNetAmount?.toString() ?? null,
            projectCostAmount:
              o.commercialOffers[0].projectCostAmount?.toString() ?? null,
            distributableProfitAmount:
              o.commercialOffers[0].distributableProfitAmount?.toString() ??
              null,
            validUntil: o.commercialOffers[0].validUntil?.toISOString() ?? null,
            profitShares: o.commercialOffers[0].profitShares.map((share) => ({
              beneficiaryType: share.beneficiaryType,
              beneficiaryName: share.beneficiaryNameSnapshot,
              percentage: share.percentage.toString(),
              amount: share.amount.toString(),
            })),
          }
        : null,
    })),
    people: people.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      phone: p.phone,
      roleTitle: p.roleTitle,
      linkedinUrl: p.linkedinUrl,
      isDecisionMaker: p.isDecisionMaker,
      isSponsor: p.isSponsor,
      companies: (p.companyRelationships ?? []).map((relationship) => ({
        id: relationship.company.id,
        name: relationship.company.name,
        roles: relationship.roles,
        roleTitle: relationship.roleTitle,
        isPrimary: relationship.isPrimary,
      })),
      primaryCompany:
        (p.companyRelationships ?? []).find(
          (relationship) => relationship.isPrimary,
        )?.company ?? null,
    })),
    recentNotes: notes.map((n) => ({ title: n.title, body: n.body })),
    recentActivities: activities.map((a) => ({
      type: a.type,
      title: a.title,
      status: a.status,
      // Solo las actividades registradas (ya ocurridas) traen estos datos;
      // las tareas mantienen el shape de siempre.
      ...(a.occurredAt
        ? {
            occurredAt: a.occurredAt.toISOString(),
            channel: a.channel,
            summary: a.description,
            outcomes: a.outcomes,
          }
        : {}),
    })),
    priorMeetings: priorMeetings.map((m) => ({
      title: m.title,
      date: m.meetingDate,
      summary: m.aiSummary,
    })),
    contextProfile: contextProfile
      ? {
          summary: contextProfile.summary,
          keyFacts: contextProfile.keyFacts,
          topics: contextProfile.topics,
          lastAnalyzedAt: contextProfile.lastAnalyzedAt.toISOString(),
        }
      : null,
    contextSources,
  };
}

// Compact AI context profile + source list for any CRM entity.
export async function snapshotEntityContext(
  db: TenantClient,
  entityType: "company" | "person" | "opportunity",
  entityId: string,
) {
  const [profile, sources] = await Promise.all([
    db.entityContextProfile.findFirst({
      where: { entityType, entityId },
      select: {
        summary: true,
        keyFacts: true,
        topics: true,
        lastAnalyzedAt: true,
      },
    }),
    db.entityContextSource.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        filename: true,
        sourceType: true,
        status: true,
        externalRef: true,
      },
    }),
  ]);

  return {
    contextProfile: profile
      ? {
          summary: profile.summary,
          keyFacts: profile.keyFacts,
          topics: profile.topics,
          lastAnalyzedAt: profile.lastAnalyzedAt.toISOString(),
        }
      : null,
    contextSources: sources,
  };
}

// Custom field values keyed as "custom.<fieldName>" so they match the field
// registry naming the agent uses when proposing updates.
export async function snapshotCustomFields(
  db: TenantClient,
  entityType: EntityType,
  entityId: string,
): Promise<Record<string, unknown>> {
  const merged = await mergeCustomFields(db, entityType, entityId);
  const result: Record<string, unknown> = {};
  for (const { definition, value } of merged) {
    result[`${CUSTOM_FIELD_PREFIX}${definition.fieldName}`] =
      value?.valueText ??
      value?.valueNumber?.toString() ??
      value?.valueBoolean ??
      value?.valueDate?.toISOString() ??
      value?.valueJson ??
      null;
  }
  return result;
}

export type CompanySnapshot = Awaited<ReturnType<typeof buildCompanySnapshot>>;
