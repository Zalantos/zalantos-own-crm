import type { Tool, ToolSet } from "ai";
import type { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import type { ResolvedPageContext } from "./context";
import type { AgentProposalItemInput } from "./proposals";
import { buildReadTools } from "./tools/read";
import { buildAnalyticsTools } from "./tools/analytics";
import { buildTimelineTools } from "./tools/timeline";
import { buildAgendaTools } from "./tools/agenda";
import { buildMeetingTools } from "./tools/meetings";
import { buildWriteSafeTools } from "./tools/write-safe";
import { buildActivityWriteTools } from "./tools/write-activity";
import { buildTaskTools } from "./tools/tasks";
import { buildProposalTools } from "./tools/write-proposal";
import { buildConfirmProposalTools } from "./tools/confirm-proposal";
import { buildAttachmentTools } from "./tools/attachments";
import { buildContextSourceTools } from "./tools/context-sources";
import { buildWebSearchTools } from "./tools/web-search";
import { buildTeamMemberTools } from "./tools/team-members";

// Estado mutable compartido por todas las tools de UN turno (mismo
// buildAgentTools). No sobrevive entre turnos: se recrea en cada request.
// Optional compatibility hook used only by the in-memory tool tests. Runtime
// code always persists and applies through the change ledger.
export type PendingInstantChange = {
  kind: "note" | "task" | "activity" | "meeting" | "task_update";
  entityId: string;
  companyId: string;
  opportunityId: string | null;
  item: AgentProposalItemInput;
  undo?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type AgentTurnState = {
  changeCount: number;
  pendingInstant: PendingInstantChange | null;
  proposalId: string | null;
};

export type AgentToolContext = {
  organizationId: string;
  db: TenantClient;
  userId: string;
  threadId: string;
  channel: "web" | "telegram" | "mcp";
  autoApply?: boolean;
  proposalModel?: string;
  pageContext: ResolvedPageContext | null;
  turnState: AgentTurnState;
};

// Normaliza el resultado de una tool a JSON puro. Prisma devuelve Date y
// Decimal como objetos; si un resultado los arrastra crudos, el AI SDK rechaza
// el prompt al re-validarlo tras el paso de tools ("The messages do not match
// the ModelMessage[] schema"). Date/Decimal tienen toJSON, así que
// JSON.stringify los serializa; el replacer cubre bigint, que no lo tiene.
export function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return value;
  return JSON.parse(
    JSON.stringify(value, (_key, val) =>
      typeof val === "bigint" ? val.toString() : val,
    ),
  );
}

export function buildAgentToolDefinitions(ctx: AgentToolContext) {
  return {
    ...buildReadTools(ctx),
    ...buildAnalyticsTools(ctx),
    ...buildTimelineTools(ctx),
    ...buildAgendaTools(ctx),
    ...buildTeamMemberTools(ctx),
    ...buildMeetingTools(ctx),
    ...buildWriteSafeTools(ctx),
    ...buildActivityWriteTools(ctx),
    ...buildTaskTools(ctx),
    ...buildProposalTools(ctx),
    ...buildConfirmProposalTools(ctx),
    ...buildAttachmentTools(ctx),
    ...buildContextSourceTools(ctx),
    ...buildWebSearchTools(ctx),
  };
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

// Builds the tool set for one agent turn. Every runtime mutation first writes
// CRMChangeProposal/CRMChangeItem and then uses the centralized apply engine.
// turnState groups all mutations from the turn into the same traceable batch.
// confirm_pending_proposal remains only for destructive or legacy batches.
export function buildAgentTools(
  input: Omit<AgentToolContext, "turnState">,
): ToolSet {
  const ctx: AgentToolContext = {
    ...input,
    turnState: { changeCount: 0, pendingInstant: null, proposalId: null },
  };
  const tools: ToolSet = buildAgentToolDefinitions(ctx);
  return Object.fromEntries(
    Object.entries(tools).map(([name, toolDefinition]) => [
      name,
      withErrorCapture(name, toolDefinition),
    ]),
  );
}
