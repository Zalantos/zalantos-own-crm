import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/agent/executor";
import { agentConfig } from "@/lib/agent/config";
import { appUrl } from "@/lib/meeting-intelligence/config";
import { applyProposal, getProposalContext } from "@/lib/meeting-intelligence/apply";
import { appendTimelineEvent } from "@/lib/timeline";

// Aplica o rechaza la propuesta pendiente más reciente del thread desde la
// conversación (pensado para Telegram, donde no hay tarjeta interactiva). Aplica
// escritura real al CRM, por eso NO vive en write-proposal.ts (esa carpeta solo
// crea propuestas). El scope de tenant/propiedad lo garantiza filtrar por
// chatThreadId con el cliente ya scopeado por organización.
export function buildConfirmProposalTools(ctx: AgentToolContext) {
  return {
    confirm_pending_proposal: tool({
      description:
        "Aplica o rechaza la propuesta de cambios pendiente más reciente de esta conversación. Usala SOLO cuando el usuario confirme o rechace explícitamente, en respuesta directa a una propuesta que acabás de generar. approve=true aplica todos los cambios; approve=false la rechaza.",
      inputSchema: z.object({
        approve: z
          .boolean()
          .describe("true para aplicar la propuesta, false para rechazarla"),
      }),
      execute: async ({ approve }) => {
        // status "pending" = la propuesta todavía no se aplicó ni rechazó (una vez
        // aplicada, applyProposal la pasa a applied/partially_approved). No se
        // filtra por status de ítems: los de alta confianza nacen "approved" pero
        // igual necesitan aplicarse.
        const proposal = await ctx.db.cRMChangeProposal.findFirst({
          where: {
            status: "pending",
            source: "agent",
            chatThreadId: ctx.threadId,
          },
          orderBy: { createdAt: "desc" },
          include: { items: { select: { id: true } } },
        });

        if (!proposal) {
          return {
            error:
              "No hay ninguna propuesta pendiente en este chat para confirmar.",
          };
        }

        if (approve) {
          // Propuestas grandes se revisan en la web (no aprobar a ciegas por chat).
          if (proposal.items.length > agentConfig.maxChatConfirmItems) {
            return {
              status: "too_large" as const,
              itemCount: proposal.items.length,
              reviewUrl: `${appUrl()}/agent/proposals`,
              message: `Esta propuesta tiene ${proposal.items.length} cambios. Es mejor revisarla en detalle en la web antes de aplicarla.`,
            };
          }

          // El usuario confirma toda la propuesta: aprobar los ítems no-terminales
          // antes de aplicar (applyProposal solo aplica los approved=true).
          await ctx.db.cRMChangeItem.updateMany({
            where: {
              proposalId: proposal.id,
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

        // Rechazo: replica la lógica de rejectAgentProposal (no hay función core).
        await ctx.db.cRMChangeProposal.update({
          where: { id: proposal.id },
          data: {
            status: "rejected",
            reviewedBy: ctx.userId,
            reviewedAt: new Date(),
          },
        });
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
          summary: "Chat del agente",
          refType: "proposal",
          refId: proposal.id,
          actorId: ctx.userId,
          metadata: { proposalId: proposal.id, via: "agent" },
        });

        return { status: "rejected" as const };
      },
    }),
  };
}
