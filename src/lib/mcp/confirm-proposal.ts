import { z } from "zod";
import { agentConfig } from "@/lib/agent/config";
import { defineAgentTool } from "@/lib/agent/tool-definition";
import { appUrl } from "@/lib/meeting-intelligence/config";
import {
  applyProposal,
  getProposalContext,
} from "@/lib/meeting-intelligence/apply";
import type { TenantClient } from "@/lib/tenant";
import { appendTimelineEvent } from "@/lib/timeline";

type ConfirmProposalContext = {
  organizationId: string;
  db: TenantClient;
  userId: string;
};

export function buildMcpConfirmProposalTool(ctx: ConfirmProposalContext) {
  return defineAgentTool({
    description:
      "Aplica o rechaza una propuesta concreta por proposalId. Llamala solo cuando el usuario pidió explícitamente confirmar o rechazar ese id. Si devuelve too_large, compartí reviewUrl y no reintentes.",
    inputSchema: z.object({
      proposalId: z.string().min(1),
      approve: z
        .boolean()
        .describe("true para aplicar; false para rechazar la propuesta"),
    }),
    execute: async ({ proposalId, approve }) => {
      const proposal = await ctx.db.cRMChangeProposal.findUnique({
        where: { id: proposalId },
        select: {
          id: true,
          source: true,
          status: true,
          chatThreadId: true,
          items: { select: { id: true } },
        },
      });
      if (
        !proposal ||
        proposal.source !== "agent" ||
        proposal.status !== "pending" ||
        !proposal.chatThreadId
      ) {
        throw new Error("Propuesta no encontrada");
      }

      const thread = await ctx.db.agentChatThread.findUnique({
        where: { id: proposal.chatThreadId },
        select: { userId: true },
      });
      if (thread?.userId !== ctx.userId) {
        throw new Error("Propuesta no encontrada");
      }

      if (approve) {
        if (proposal.items.length > agentConfig.maxChatConfirmItems) {
          return {
            status: "too_large" as const,
            itemCount: proposal.items.length,
            reviewUrl: `${appUrl()}/agent/proposals`,
          };
        }
        if (proposal.items.length === 0) {
          throw new Error("Propuesta no encontrada");
        }

        await ctx.db.cRMChangeItem.updateMany({
          where: {
            proposalId: proposal.id,
            proposal: { status: "pending" },
            status: { notIn: ["applied", "reverted", "failed"] },
          },
          data: { approved: true, status: "approved" },
        });
        const result = await applyProposal(
          ctx.db,
          ctx.organizationId,
          proposal.id,
          ctx.userId,
        );
        return {
          status: "applied" as const,
          applied: result.applied,
          failed: result.failed,
        };
      }

      const rejected = await ctx.db.cRMChangeProposal.updateMany({
        where: { id: proposal.id, status: "pending" },
        data: {
          status: "rejected",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        },
      });
      if (rejected.count !== 1) {
        throw new Error("Propuesta no encontrada");
      }
      await ctx.db.cRMChangeItem.updateMany({
        where: { proposalId: proposal.id, status: { notIn: ["applied"] } },
        data: { approved: false, status: "rejected" },
      });

      const context = await getProposalContext(ctx.db, proposal.id);
      await appendTimelineEvent(ctx.db, {
        organizationId: ctx.organizationId,
        companyId: context.companyId,
        opportunityId: context.opportunityId,
        type: "proposal_rejected",
        title: "Rechazó la propuesta de cambios del agente",
        summary: "MCP",
        refType: "proposal",
        refId: proposal.id,
        actorId: ctx.userId,
        metadata: { proposalId: proposal.id, via: "mcp" },
      });

      return { status: "rejected" as const };
    },
  });
}
