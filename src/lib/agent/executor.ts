import type { Tool, ToolSet } from "ai";
import type { TenantClient } from "@/lib/tenant";
import type { ResolvedPageContext } from "./context";
import { buildReadTools } from "./tools/read";
import { buildAnalyticsTools } from "./tools/analytics";
import { buildTimelineTools } from "./tools/timeline";
import { buildAgendaTools } from "./tools/agenda";
import { buildMeetingTools } from "./tools/meetings";
import { buildWriteSafeTools } from "./tools/write-safe";
import { buildProposalTools } from "./tools/write-proposal";
import { buildConfirmProposalTools } from "./tools/confirm-proposal";
import { buildAttachmentTools } from "./tools/attachments";
import { buildContextSourceTools } from "./tools/context-sources";

export type AgentToolContext = {
  organizationId: string;
  db: TenantClient;
  userId: string;
  threadId: string;
  pageContext: ResolvedPageContext | null;
};

// Normaliza el resultado de una tool a JSON puro. Prisma devuelve Date y
// Decimal como objetos; si un resultado los arrastra crudos, el AI SDK rechaza
// el prompt al re-validarlo tras el paso de tools ("The messages do not match
// the ModelMessage[] schema"). Date/Decimal tienen toJSON, así que
// JSON.stringify los serializa; el replacer cubre bigint, que no lo tiene.
function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return value;
  return JSON.parse(
    JSON.stringify(value, (_key, val) =>
      typeof val === "bigint" ? val.toString() : val,
    ),
  );
}

// Tool execute errors are returned as results (never thrown into the stream)
// so the model can read the message and self-correct.
function withErrorCapture(name: string, toolDefinition: Tool): Tool {
  const originalExecute = toolDefinition.execute;
  if (!originalExecute) return toolDefinition;
  return {
    ...toolDefinition,
    execute: async (input, options) => {
      try {
        return toJsonSafe(await originalExecute(input, options));
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
// La excepción es confirm_pending_proposal, que aplica una propuesta que el
// usuario ya aprobó explícitamente en la conversación (no genera cambios nuevos).
export function buildAgentTools(ctx: AgentToolContext): ToolSet {
  const tools: ToolSet = {
    ...buildReadTools(ctx),
    ...buildAnalyticsTools(ctx),
    ...buildTimelineTools(ctx),
    ...buildAgendaTools(ctx),
    ...buildMeetingTools(ctx),
    ...buildWriteSafeTools(ctx),
    ...buildProposalTools(ctx),
    ...buildConfirmProposalTools(ctx),
    ...buildAttachmentTools(ctx),
    ...buildContextSourceTools(ctx),
  };
  return Object.fromEntries(
    Object.entries(tools).map(([name, toolDefinition]) => [
      name,
      withErrorCapture(name, toolDefinition),
    ]),
  );
}
