import type { TenantClient } from "@/lib/tenant";
import { buildCompanySnapshot } from "@/lib/agent/snapshot";

// Thin wrapper over the shared company snapshot: adds the meeting being
// processed and excludes it from the prior-meetings list.
export async function buildCrmSnapshot(db: TenantClient, meetingId: string) {
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
  });
  if (!meeting) throw new Error(`Meeting no encontrada: ${meetingId}`);

  const base = await buildCompanySnapshot(db, meeting.companyId, {
    excludeMeetingId: meetingId,
  });

  return {
    ...base,
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
