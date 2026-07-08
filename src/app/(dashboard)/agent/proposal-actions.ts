"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext, type TenantClient } from "@/lib/tenant";
import {
  applyProposal,
  getProposalContext,
  revertItem,
} from "@/lib/meeting-intelligence/apply";
import { appendTimelineEvent } from "@/lib/timeline";

// Agent proposals are tied to a chat thread; only the thread owner can act on
// them. Meeting proposals are managed from /meetings, not from here.
async function requireOwnedAgentProposal(
  db: TenantClient,
  proposalId: string,
  userId: string,
) {
  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, source: true, status: true, chatThreadId: true },
  });
  if (!proposal || proposal.source !== "agent" || !proposal.chatThreadId) {
    throw new Error("Propuesta no encontrada");
  }
  const thread = await db.agentChatThread.findUnique({
    where: { id: proposal.chatThreadId },
    select: { userId: true },
  });
  if (thread?.userId !== userId) {
    throw new Error("Propuesta no encontrada");
  }
  return proposal;
}

export type AgentProposalState = {
  status: string;
  items: { id: string; approved: boolean; status: string }[];
};

export async function getAgentProposalState(
  proposalId: string,
): Promise<AgentProposalState> {
  const { user, db } = await requireOrgContext();
  const proposal = await requireOwnedAgentProposal(db, proposalId, user.id);
  const items = await db.cRMChangeItem.findMany({
    where: { proposalId },
    orderBy: { id: "asc" },
    select: { id: true, approved: true, status: true },
  });
  return { status: proposal.status, items };
}

export async function setAgentItemApproval(
  proposalId: string,
  itemId: string,
  approved: boolean,
) {
  const { user, db } = await requireOrgContext();
  await requireOwnedAgentProposal(db, proposalId, user.id);
  await db.cRMChangeItem.update({
    where: { id: itemId, proposalId },
    data: { approved, status: approved ? "approved" : "pending" },
  });
}

function entityPaths(context: {
  companyId: string;
  opportunityId: string | null;
}) {
  const paths = [`/companies/${context.companyId}`, "/companies", "/people"];
  if (context.opportunityId) {
    paths.push(`/opportunities/${context.opportunityId}`);
  }
  paths.push("/opportunities");
  return paths;
}

export async function applyAgentProposal(proposalId: string) {
  const { user, org, db } = await requireOrgContext();
  await requireOwnedAgentProposal(db, proposalId, user.id);

  const result = await applyProposal(db, org.id, proposalId, user.id);

  const context = await getProposalContext(db, proposalId);
  for (const path of entityPaths(context)) {
    revalidatePath(path);
  }
  return result;
}

export async function revertAgentItem(
  proposalId: string,
  itemId: string,
): Promise<{ error?: string }> {
  const { user, org, db } = await requireOrgContext();
  await requireOwnedAgentProposal(db, proposalId, user.id);
  try {
    await revertItem(db, org.id, itemId, user.id);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo deshacer.",
    };
  }

  const context = await getProposalContext(db, proposalId);
  for (const path of entityPaths(context)) {
    revalidatePath(path);
  }
  return {};
}

export async function rejectAgentProposal(proposalId: string) {
  const { user, org, db } = await requireOrgContext();
  await requireOwnedAgentProposal(db, proposalId, user.id);

  await db.cRMChangeProposal.update({
    where: { id: proposalId },
    data: { status: "rejected", reviewedBy: user.id, reviewedAt: new Date() },
  });
  await db.cRMChangeItem.updateMany({
    where: { proposalId, status: { notIn: ["applied"] } },
    data: { approved: false, status: "rejected" },
  });

  const context = await getProposalContext(db, proposalId);
  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: context.companyId,
    opportunityId: context.opportunityId,
    type: "proposal_rejected",
    title: "Rechazó la propuesta de cambios del agente",
    summary: "Chat del agente",
    refType: "proposal",
    refId: proposalId,
    actorId: user.id,
    metadata: { proposalId, via: "agent" },
  });
}
