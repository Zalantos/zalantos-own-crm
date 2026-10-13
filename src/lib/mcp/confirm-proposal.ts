import { z } from "zod";
import { defineAgentTool } from "@/lib/agent/tool-definition";
import {
  applyProposal,
  getProposalContext,
} from "@/lib/meeting-intelligence/apply";
import type { TenantClient } from "@/lib/tenant";
import { appendTimelineEvent } from "@/lib/timeline";
import { readMutationResult } from "@/lib/agent/proposals";
import { requireCanApproveProposal } from "@/lib/agent/proposal-authorization";

type ConfirmProposalContext = {
  organizationId: string;
  db: TenantClient;
  userId: string;
};

export function buildMcpConfirmProposalTool(ctx: ConfirmProposalContext) {
  return defineAgentTool({
    description:
      "Aplica o rechaza una propuesta concreta por proposalId. Llamala solo cuando el usuario pidió explícitamente confirmar o rechazar ese id.",
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
          items: { select: { id: true } },
        },
      });
      if (
        !proposal ||
        !["pending", "partially_applied"].includes(proposal.status)
      ) {
        throw new Error("Propuesta no encontrada");
      }

      const currentUser = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });
      await requireCanApproveProposal(ctx.db, proposal.id, {
        id: ctx.userId,
        role: currentUser?.role ?? "MEMBER",
      });

      if (approve) {
        if (proposal.items.length === 0) {
          throw new Error("Propuesta no encontrada");
        }

        await ctx.db.cRMChangeItem.updateMany({
          where: {
            proposalId: proposal.id,
            proposal: {
              status: { in: ["pending", "partially_applied"] },
            },
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
          ...(await readMutationResult(ctx.db, proposal.id)),
          applied: result.applied,
          failed: result.failed,
        };
      }

      const applied = await ctx.db.cRMChangeItem.count({
        where: { proposalId: proposal.id, status: "applied" },
      });
      const rejected = await ctx.db.cRMChangeProposal.updateMany({
        where: {
          id: proposal.id,
          status: { in: ["pending", "partially_applied"] },
        },
        data: {
          status: applied > 0 ? "partially_approved" : "rejected",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
          completedAt: new Date(),
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

      return readMutationResult(ctx.db, proposal.id);
    },
  });
}
