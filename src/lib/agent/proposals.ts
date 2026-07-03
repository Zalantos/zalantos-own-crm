import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agentConfig } from "./config";

export type AgentProposalItemInput = {
  type: "update_field" | "stage_change" | "add_contact";
  entity: "company" | "opportunity" | "person";
  entityId: string | null;
  beforeValue: Prisma.InputJsonValue | null;
  afterValue: Prisma.InputJsonValue;
  explanation: string;
  // Human-readable summary line for the inline chat card.
  label: string;
  before: string;
  after: string;
};

type CreateAgentProposalInput = {
  threadId: string;
  companyId: string;
  opportunityId?: string | null;
  items: AgentProposalItemInput[];
};

// The only write path available to "proposal"-classified agent tools: it
// persists a reviewable CRMChangeProposal. Items start approved so the user
// only unticks what they disagree with before applying.
export async function createAgentProposal({
  threadId,
  companyId,
  opportunityId,
  items,
}: CreateAgentProposalInput) {
  const proposal = await prisma.cRMChangeProposal.create({
    data: {
      source: "agent",
      companyId,
      opportunityId: opportunityId ?? null,
      chatThreadId: threadId,
      confidence: 1,
      model: agentConfig.modelSpec,
      items: {
        create: items.map((item) => ({
          type: item.type,
          entity: item.entity,
          entityId: item.entityId,
          beforeValue: item.beforeValue ?? undefined,
          afterValue: item.afterValue,
          confidence: 1,
          explanation: item.explanation,
          approved: true,
          status: "approved",
        })),
      },
    },
    include: { items: { select: { id: true } } },
  });

  return {
    status: "proposal_created" as const,
    proposalId: proposal.id,
    items: proposal.items.map((item, index) => ({
      id: item.id,
      label: items[index].label,
      before: items[index].before,
      after: items[index].after,
      explanation: items[index].explanation,
    })),
  };
}
