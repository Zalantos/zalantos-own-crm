import { prisma } from "@/lib/prisma";
import { CUSTOM_FIELD_PREFIX } from "@/lib/agent/field-registry";
import { mergeCustomFields } from "@/lib/custom-fields/merge";
import type { EntityType } from "@prisma/client";

// Compact, serializable view of one company that the model reasons against.
// Kept bounded on purpose (recent records only) to control token cost.
// Extracted from the Meeting Intelligence snapshot so chat and pipeline share it.
export async function buildCompanySnapshot(
  companyId: string,
  options: { excludeMeetingId?: string } = {},
) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error(`Empresa no encontrada: ${companyId}`);

  const [
    opportunities,
    people,
    notes,
    activities,
    priorMeetings,
    customFields,
  ] = await Promise.all([
    prisma.opportunity.findMany({ where: { companyId } }),
    prisma.person.findMany({ where: { companyId } }),
    prisma.note.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.activity.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.meeting.findMany({
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
    snapshotCustomFields("company", companyId),
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
      customFields,
    },
    opportunities: opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      stage: o.stage,
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
    })),
    recentNotes: notes.map((n) => ({ title: n.title, body: n.body })),
    recentActivities: activities.map((a) => ({
      type: a.type,
      title: a.title,
      status: a.status,
    })),
    priorMeetings: priorMeetings.map((m) => ({
      title: m.title,
      date: m.meetingDate,
      summary: m.aiSummary,
    })),
  };
}

// Custom field values keyed as "custom.<fieldName>" so they match the field
// registry naming the agent uses when proposing updates.
export async function snapshotCustomFields(
  entityType: EntityType,
  entityId: string,
): Promise<Record<string, unknown>> {
  const merged = await mergeCustomFields(entityType, entityId);
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
