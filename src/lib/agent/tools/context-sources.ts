import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/agent/executor";

const PAGE_SIZE = 12_000;

// Pages through an entity context source's extracted text (documents on
// company/person/opportunity fichas).
export function buildContextSourceTools(ctx: AgentToolContext) {
  return {
    read_context_source: tool({
      description:
        "Lee el texto extraído de una fuente de contexto de una ficha CRM (documento subido a empresa/persona/oportunidad), por páginas.",
      inputSchema: z.object({
        sourceId: z.string().min(1),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Posición (en caracteres) desde donde leer"),
      }),
      execute: async ({ sourceId, offset }) => {
        const source = await ctx.db.entityContextSource.findFirst({
          where: { id: sourceId },
          select: {
            filename: true,
            extractedText: true,
            entityType: true,
            entityId: true,
            status: true,
          },
        });
        if (!source?.extractedText) {
          return { error: `Fuente de contexto no encontrada: ${sourceId}` };
        }
        const start = offset ?? 0;
        const text = source.extractedText.slice(start, start + PAGE_SIZE);
        const total = source.extractedText.length;
        return {
          filename: source.filename,
          entityType: source.entityType,
          entityId: source.entityId,
          status: source.status,
          offset: start,
          totalChars: total,
          hasMore: start + PAGE_SIZE < total,
          text,
        };
      },
    }),
  };
}
