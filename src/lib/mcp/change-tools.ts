import { z } from "zod";
import { defineAgentTool } from "@/lib/agent/tool-definition";
import type { AgentToolContext } from "@/lib/agent/executor";
import {
  RevertConflictError,
  revertItem,
  revertProposal,
} from "@/lib/meeting-intelligence/apply";

const statusSchema = z.enum([
  "pending",
  "applying",
  "approved",
  "rejected",
  "partially_approved",
  "applied",
  "partially_applied",
  "failed",
  "partially_reverted",
  "reverted",
]);

function conflictResult(error: unknown) {
  if (error instanceof RevertConflictError) {
    return {
      status: "conflict" as const,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  throw error;
}

export function buildMcpChangeTools(ctx: AgentToolContext) {
  return {
    list_ai_changes: defineAgentTool({
      description:
        "Lista la trazabilidad de cambios ejecutados por IA en la organización, incluidos cambios aplicados, fallidos, revertidos y destructivos pendientes.",
      inputSchema: z.object({
        status: statusSchema.optional(),
        channel: z
          .enum([
            "legacy",
            "web",
            "telegram",
            "mcp",
            "meeting",
            "enrichment",
            "workflow",
          ])
          .optional(),
        needsAttention: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
      execute: async ({ status, channel, needsAttention, limit, cursor }) => {
        const take = limit ?? 25;
        const changes = await ctx.db.cRMChangeProposal.findMany({
          where: {
            ...(status ? { status } : {}),
            ...(channel ? { channel } : {}),
            ...(needsAttention
              ? {
                  OR: [
                    { confidence: { lt: 0.8 } },
                    {
                      status: {
                        in: ["failed", "partially_applied", "pending"],
                      },
                    },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: take + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          include: {
            items: {
              orderBy: [{ sequence: "asc" }, { id: "asc" }],
              select: {
                id: true,
                type: true,
                entity: true,
                entityId: true,
                label: true,
                status: true,
                confidence: true,
                undoExpiresAt: true,
                failureCode: true,
                failureMessage: true,
              },
            },
          },
        });
        const hasMore = changes.length > take;
        const page = hasMore ? changes.slice(0, take) : changes;
        return {
          changes: page,
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        };
      },
    }),

    get_ai_change: defineAgentTool({
      description:
        "Obtiene el detalle completo de un lote de cambios IA, incluido antes/después, evidencia, errores y ventana de reversión.",
      inputSchema: z.object({ changeBatchId: z.string().min(1) }),
      execute: async ({ changeBatchId }) => {
        const change = await ctx.db.cRMChangeProposal.findUnique({
          where: { id: changeBatchId },
          include: {
            items: { orderBy: [{ sequence: "asc" }, { id: "asc" }] },
          },
        });
        if (!change) throw new Error("Cambio no encontrado");
        return { change };
      },
    }),

    revert_ai_change_item: defineAgentTool({
      description:
        "Deshace un ítem aplicado si sigue dentro de 90 días y el registro no cambió después. Nunca fuerza la sobrescritura de trabajo posterior.",
      inputSchema: z.object({ itemId: z.string().min(1) }),
      execute: async ({ itemId }) => {
        try {
          await revertItem(ctx.db, ctx.organizationId, itemId, ctx.userId);
          return { status: "reverted" as const, itemId };
        } catch (error) {
          return conflictResult(error);
        }
      },
    }),

    revert_ai_change_batch: defineAgentTool({
      description:
        "Deshace un lote completo en orden inverso. Primero valida todos los ítems y bloquea el lote si alguno venció, cambió o tiene dependencias.",
      inputSchema: z.object({ changeBatchId: z.string().min(1) }),
      execute: async ({ changeBatchId }) => {
        try {
          const result = await revertProposal(
            ctx.db,
            ctx.organizationId,
            changeBatchId,
            ctx.userId,
          );
          return { status: "reverted" as const, changeBatchId, ...result };
        } catch (error) {
          return conflictResult(error);
        }
      },
    }),
  };
}
