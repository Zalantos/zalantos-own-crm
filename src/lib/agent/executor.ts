import type { Tool, ToolSet } from "ai";
import type { TenantClient } from "@/lib/tenant";
import type { ResolvedPageContext } from "./context";
import { buildReadTools } from "./tools/read";
import { buildWriteSafeTools } from "./tools/write-safe";
import { buildProposalTools } from "./tools/write-proposal";
import { buildAttachmentTools } from "./tools/attachments";

export type AgentToolContext = {
  organizationId: string;
  db: TenantClient;
  userId: string;
  threadId: string;
  pageContext: ResolvedPageContext | null;
};

// Tool execute errors are returned as results (never thrown into the stream)
// so the model can read the message and self-correct.
function withErrorCapture(name: string, toolDefinition: Tool): Tool {
  const originalExecute = toolDefinition.execute;
  if (!originalExecute) return toolDefinition;
  return {
    ...toolDefinition,
    execute: async (input, options) => {
      try {
        return await originalExecute(input, options);
      } catch (error) {
        console.error(`[agent] tool ${name} falló`, error);
        return {
          error: error instanceof Error ? error.message : "Error inesperado",
        };
      }
    },
  } as Tool;
}

// Builds the tool set for one agent turn. Autonomy is enforced here by
// construction: mutation tools live in write-proposal.ts and only ever create
// CRMChangeProposal rows — there is no code path from them to a direct write.
export function buildAgentTools(ctx: AgentToolContext): ToolSet {
  const tools: ToolSet = {
    ...buildReadTools(ctx),
    ...buildWriteSafeTools(ctx),
    ...buildProposalTools(ctx),
    ...buildAttachmentTools(ctx),
  };
  return Object.fromEntries(
    Object.entries(tools).map(([name, toolDefinition]) => [
      name,
      withErrorCapture(name, toolDefinition),
    ]),
  );
}
