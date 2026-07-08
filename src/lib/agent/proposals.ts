import type { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { approvalFromConfidence } from "@/lib/crm/proposal-policy";
import { agentConfig } from "./config";

export type AgentProposalItemInput = {
  type: "update_field" | "stage_change" | "add_contact" | "link_contact";
  entity: "company" | "opportunity" | "person";
  entityId: string | null;
  beforeValue: Prisma.InputJsonValue | null;
  afterValue: Prisma.InputJsonValue;
  explanation: string;
  // Model's self-assessed confidence (0-1); drives auto-approval and the card.
  confidence: number;
  // Verbatim quote from the user's message/document that justifies the change.
  evidence?: string | null;
  // Existing person the dedup matched (set on link_contact items).
  duplicateOfId?: string | null;
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
  // Proposal-level confidence = the least confident item (the weakest link).
  const proposalConfidence = items.length
    ? Math.min(...items.map((item) => item.confidence))
    : 1;

  const proposal = await db.cRMChangeProposal.create({
    data: {
      organizationId,
      source: "agent",
      companyId,
      opportunityId: opportunityId ?? null,
      chatThreadId: threadId,
      confidence: proposalConfidence,
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
          confidence: item.confidence,
          explanation: item.explanation,
          evidence: item.evidence || null,
          duplicateOfId: item.duplicateOfId ?? null,
          // Pre-approve only high-confidence items; the rest need a tick.
          ...approvalFromConfidence(item.confidence),
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
      evidence: items[index].evidence ?? null,
      confidence: items[index].confidence,
      approved: approvalFromConfidence(items[index].confidence).approved,
    })),
  };
}
