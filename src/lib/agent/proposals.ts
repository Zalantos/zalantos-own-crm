import type { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
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
export async function createAgentProposal(
  db: TenantClient,
  organizationId: string,
  { threadId, companyId, opportunityId, items }: CreateAgentProposalInput,
) {
  const proposal = await db.cRMChangeProposal.create({
    data: {
      organizationId,
      source: "agent",
      companyId,
      opportunityId: opportunityId ?? null,
      chatThreadId: threadId,
      confidence: 1,
      model: agentConfig.modelSpec,
      items: {
        // Los creates anidados no pasan por el auto-scoping: org explícita.
        create: items.map((item) => ({
          organizationId,
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
