import { prisma } from "@/lib/prisma";

// Compact, serializable view of the CRM that the model reasons against. Kept
// bounded on purpose (recent records only) to control token cost.
export async function buildCrmSnapshot(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { company: true },
  });
  if (!meeting) throw new Error(`Meeting no encontrada: ${meetingId}`);

  const companyId = meeting.companyId;

  const [opportunities, people, notes, activities, priorMeetings] =
    await Promise.all([
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
        where: { companyId, id: { not: meetingId }, processingStatus: "ready" },
        orderBy: { meetingDate: "desc" },
        take: 5,
        select: { id: true, title: true, meetingDate: true, aiSummary: true },
      }),
    ]);

  return {
    company: {
      id: meeting.company.id,
      name: meeting.company.name,
      industry: meeting.company.industry,
      size: meeting.company.size,
      country: meeting.company.country,
      city: meeting.company.city,
      description: meeting.company.description,
      painScore: meeting.company.painScore,
      status: meeting.company.status,
    },
    opportunities: opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      stage: o.stage,
      status: o.status,
      mainPain: o.mainPain,
      urgency: o.urgency,
      nextStep: o.nextStep,
      probability: o.probability,
      estimatedValue: o.estimatedValue?.toString() ?? null,
      decisionMakerId: o.decisionMakerId,
      sponsorId: o.sponsorId,
    })),
    people: people.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      roleTitle: p.roleTitle,
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
    currentMeeting: {
      id: meeting.id,
      title: meeting.title,
      type: meeting.meetingType,
      date: meeting.meetingDate,
      opportunityId: meeting.opportunityId,
      participants: meeting.participants,
    },
  };
}

export type CrmSnapshot = Awaited<ReturnType<typeof buildCrmSnapshot>>;
