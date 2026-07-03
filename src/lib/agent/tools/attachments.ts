import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { AgentToolContext } from "@/lib/agent/executor";

const PAGE_SIZE = 12_000;

// Pages through an attachment's extracted text so long documents don't need
// to fit in the inline excerpt injected with the message.
export function buildAttachmentTools(ctx: AgentToolContext) {
  return {
    read_attachment: tool({
      description:
        "Lee el texto extraído de un documento adjunto del chat, por páginas. Usala cuando el extracto inline esté truncado.",
      inputSchema: z.object({
        attachmentId: z.string().min(1),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Posición (en caracteres) desde donde leer"),
      }),
      execute: async ({ attachmentId, offset }) => {
        const attachment = await prisma.agentAttachment.findFirst({
          where: { id: attachmentId, threadId: ctx.threadId },
          select: { filename: true, extractedText: true },
        });
        if (!attachment?.extractedText) {
          return { error: `Adjunto no encontrado: ${attachmentId}` };
        }
        const start = offset ?? 0;
        const text = attachment.extractedText.slice(start, start + PAGE_SIZE);
        const total = attachment.extractedText.length;
        return {
          filename: attachment.filename,
          offset: start,
          totalChars: total,
          hasMore: start + PAGE_SIZE < total,
          text,
        };
      },
    }),
  };
}
