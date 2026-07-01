import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type TimelineInput = {
  companyId: string;
  opportunityId?: string | null;
  type: string;
  title: string;
  summary?: string | null;
  refType?: string | null;
  refId?: string | null;
  actorId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

// Append-only event log. Accepts a transaction client so it can be written
// atomically alongside the domain change that produced it.
export async function appendTimelineEvent(
  client: Prisma.TransactionClient | typeof prisma,
  input: TimelineInput,
) {
  await client.timelineEvent.create({
    data: {
      companyId: input.companyId,
      opportunityId: input.opportunityId ?? null,
      type: input.type,
      title: input.title,
      summary: input.summary ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      actorId: input.actorId ?? null,
      metadata: input.metadata,
    },
  });
}

export async function getCompanyTimeline(companyId: string) {
  return prisma.timelineEvent.findMany({
    where: { companyId },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
}
