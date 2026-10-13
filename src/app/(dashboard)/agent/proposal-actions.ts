"use server";

import { EntityType, type Prisma } from "@prisma/client";
import { generateId } from "ai";
import { revalidatePath } from "next/cache";
import { requireOrgContext, type TenantClient } from "@/lib/tenant";
import {
  applyProposal,
  getProposalContext,
  revertItem,
  revertProposal,
} from "@/lib/meeting-intelligence/apply";
import {
  dispatchIntegrationEvent,
  type OrgGatewayConfig,
} from "@/lib/integrations/gateway";
import { appendTimelineEvent } from "@/lib/timeline";
import { requireCanApproveProposal } from "@/lib/agent/proposal-authorization";

async function requireOrgProposal(db: TenantClient, proposalId: string) {
  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      source: true,
      status: true,
      chatThreadId: true,
      initiatedBy: true,
      meeting: { select: { createdBy: true } },
    },
  });
  if (!proposal) throw new Error("Cambio no encontrado");
  return proposal;
}

export type AgentProposalState = {
  status: string;
  items: {
    id: string;
    approved: boolean;
    status: string;
    undoExpiresAt: Date | null;
    failureMessage: string | null;
  }[];
};

export async function getAgentProposalState(
  proposalId: string,
): Promise<AgentProposalState> {
  const { db } = await requireOrgContext();
  const proposal = await requireOrgProposal(db, proposalId);
  const items = await db.cRMChangeItem.findMany({
    where: { proposalId },
    orderBy: [{ sequence: "asc" }, { id: "asc" }],
    select: {
      id: true,
      approved: true,
      status: true,
      undoExpiresAt: true,
      failureMessage: true,
    },
  });
  return { status: proposal.status, items };
}

export async function setAgentItemApproval(
  proposalId: string,
  itemId: string,
  approved: boolean,
) {
  const { user, db } = await requireOrgContext();
  const proposal = await requireCanApproveProposal(db, proposalId, user);
  if (!["pending", "partially_applied"].includes(proposal.status)) {
    throw new Error("La propuesta ya no se puede editar");
  }
  const { count } = await db.cRMChangeItem.updateMany({
    where: {
      id: itemId,
      proposalId,
      proposal: { status: { in: ["pending", "partially_applied"] } },
    },
    data: { approved, status: approved ? "approved" : "pending" },
  });
  if (count !== 1) throw new Error("La propuesta ya no se puede editar");
}

function entityPaths(context: {
  companyId: string | null;
  opportunityId: string | null;
}) {
  const paths = ["/companies", "/people"];
  if (context.companyId) {
    paths.push(`/companies/${context.companyId}`);
  }
  if (context.opportunityId) {
    paths.push(`/opportunities/${context.opportunityId}`);
  }
  paths.push("/opportunities");
  return paths;
}

export async function applyAgentProposal(proposalId: string) {
  const { user, org, db } = await requireOrgContext();
  const proposal = await requireCanApproveProposal(db, proposalId, user);

  const result = await applyProposal(db, org.id, proposalId, user.id);

  const context = await getProposalContext(db, proposalId);
  for (const path of entityPaths(context)) {
    revalidatePath(path);
  }

  // Si la propuesta nació en un chat de Telegram, avisar por el bot que se
  // aplicó (el usuario aprobó desde la web). Best-effort: no rompe la aprobación.
  await notifyTelegramOnApply(
    db,
    org,
    proposal.chatThreadId,
    proposalId,
    result.applied,
    context,
  );

  return result;
}

async function notifyTelegramOnApply(
  db: TenantClient,
  org: OrgGatewayConfig,
  chatThreadId: string | null,
  proposalId: string,
  appliedCount: number,
  context: { companyId: string | null; opportunityId: string | null },
) {
  if (!chatThreadId) return;
  try {
    const link = await db.telegramLink.findFirst({
      where: { agentThreadId: chatThreadId, isActive: true },
      select: { telegramChatId: true },
    });
    if (!link) return;

    const entityType = context.opportunityId
      ? EntityType.opportunity
      : EntityType.company;
    const entityId = context.opportunityId ?? context.companyId ?? proposalId;
    const notificationText = `✅ Apliqué los cambios que propusiste (${appliedCount} cambio${appliedCount === 1 ? "" : "s"}).`;

    const result = await dispatchIntegrationEvent(db, org, {
      type: "proposal_applied",
      channel: "telegram",
      entityType,
      entityId,
      recipient: { chatId: link.telegramChatId },
      dedupeKey: `telegram-notify-applied:${proposalId}`,
      payload: { text: notificationText },
    });

    // Queda en la memoria del thread (reconstruida de la DB en cada turno de
    // Telegram) para que el agente sepa que este cambio ya se aplicó desde la web.
    if (result.status !== "failed") {
      await db.agentChatMessage.create({
        data: {
          id: generateId(),
          organizationId: org.id,
          threadId: chatThreadId,
          role: "assistant",
          parts: [
            { type: "text", text: notificationText },
          ] as unknown as Prisma.InputJsonValue,
        },
      });
    }
  } catch (error) {
    console.error("[agent] no se pudo notificar a Telegram", error);
  }
}

export async function revertAgentItem(
  proposalId: string,
  itemId: string,
): Promise<{ error?: string }> {
  const { user, org, db } = await requireOrgContext();
  await requireOrgProposal(db, proposalId);
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

export async function revertAgentProposal(
  proposalId: string,
): Promise<{ error?: string; reverted?: number }> {
  const { user, org, db } = await requireOrgContext();
  await requireOrgProposal(db, proposalId);
  try {
    const result = await revertProposal(db, org.id, proposalId, user.id);
    revalidatePath("/agent/proposals");
    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo deshacer.",
    };
  }
}

export async function rejectAgentProposal(proposalId: string) {
  const { user, org, db } = await requireOrgContext();
  await requireCanApproveProposal(db, proposalId, user);

  const applied = await db.cRMChangeItem.count({
    where: { proposalId, status: "applied" },
  });
  const { count } = await db.cRMChangeProposal.updateMany({
    where: {
      id: proposalId,
      status: { in: ["pending", "partially_applied"] },
    },
    data: {
      status: applied > 0 ? "partially_approved" : "rejected",
      reviewedBy: user.id,
      reviewedAt: new Date(),
      completedAt: new Date(),
    },
  });
  if (count !== 1) throw new Error("La propuesta ya no se puede rechazar");
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
