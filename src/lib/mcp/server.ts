import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { z } from "zod";
import {
  buildAgentToolDefinitions,
  toJsonSafe,
  type AgentToolContext,
} from "@/lib/agent/executor";
import { forOrg } from "@/lib/tenant";
import type { McpPrincipal } from "./auth";
import { buildMcpConfirmProposalTool } from "./confirm-proposal";
import { ensureMcpThread } from "./thread";

const READ_TOOL_NAMES = [
  "search_crm",
  "get_record",
  "get_company_snapshot",
  "list_writable_fields",
  "query_opportunities",
  "find_inactive_opportunities",
  "get_record_timeline",
  "get_my_agenda",
  "list_meetings",
  "get_meeting",
  "read_meeting_transcript",
  "list_pending_proposals",
  "read_attachment",
  "read_context_source",
  "web_search",
] as const;

const DIRECT_WRITE_TOOL_NAMES = ["create_note", "create_task"] as const;

const PROPOSAL_TOOL_NAMES = [
  "update_record_fields",
  "change_stage",
  "create_contact",
  "create_opportunity",
  "create_company",
] as const;

const SHARED_TOOL_NAMES = [
  ...READ_TOOL_NAMES,
  ...DIRECT_WRITE_TOOL_NAMES,
  ...PROPOSAL_TOOL_NAMES,
] as const;

const DIRECT_WRITE_TOOLS = new Set<string>(DIRECT_WRITE_TOOL_NAMES);
const PROPOSAL_TOOLS = new Set<string>(PROPOSAL_TOOL_NAMES);
const THREAD_TOOLS = new Set<string>([
  ...DIRECT_WRITE_TOOL_NAMES,
  ...PROPOSAL_TOOL_NAMES,
]);

type RuntimeToolDefinition = {
  description: string;
  inputSchema: z.ZodType;
  execute: (input: never) => unknown | Promise<unknown>;
};

function createToolContext(
  principal: McpPrincipal,
  threadId: string,
): AgentToolContext {
  return {
    organizationId: principal.organizationId,
    db: forOrg(principal.organizationId),
    userId: principal.userId,
    threadId,
    proposalModel: "mcp",
    pageContext: null,
    turnState: { changeCount: 0, pendingInstant: null, proposalId: null },
  };
}

function mcpDescription(name: string, base: string): string {
  const idRule =
    "Resolvé ids con search_crm cuando corresponda; nunca inventes un id.";
  if (DIRECT_WRITE_TOOLS.has(name)) {
    return `${base} En MCP esta acción queda escrita al instante. ${idRule}`;
  }
  if (PROPOSAL_TOOLS.has(name)) {
    return `${base} En MCP nunca aplica el cambio: devuelve una propuesta pendiente con proposalId. Solo llamá confirm_proposal si el usuario pidió explícitamente confirmar ese id; si devuelve too_large, compartí reviewUrl y no reintentes. ${idRule}`;
  }
  return `${base} ${idRule}`;
}

function resultContent(value: unknown) {
  const safe = toJsonSafe(value) ?? null;
  const structuredContent =
    safe && typeof safe === "object" && !Array.isArray(safe)
      ? (safe as Record<string, unknown>)
      : undefined;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(safe) }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

async function executeTool(
  name: string,
  definition: RuntimeToolDefinition,
  input: unknown,
) {
  try {
    return resultContent(await definition.execute(input as never));
  } catch (error) {
    console.error(`[mcp] tool ${name} falló`, error);
    return resultContent({
      error: error instanceof Error ? error.message : "Error inesperado",
    });
  }
}

export async function handleMcpRequest(
  request: Request,
  principal: McpPrincipal,
): Promise<Response> {
  const db = forOrg(principal.organizationId);
  const schemaContext = createToolContext(
    principal,
    principal.agentThreadId ?? "",
  );
  const schemaDefinitions = buildAgentToolDefinitions(schemaContext);

  const server = new McpServer({ name: "zalantos-crm", version: "1.0.0" });

  for (const name of SHARED_TOOL_NAMES) {
    const definition = schemaDefinitions[name] as RuntimeToolDefinition;
    server.registerTool(
      name,
      {
        description: mcpDescription(name, definition.description),
        inputSchema: definition.inputSchema,
      },
      async (input) => {
        const threadId = THREAD_TOOLS.has(name)
          ? await ensureMcpThread(db, principal)
          : (principal.agentThreadId ?? "");
        const callDefinitions = buildAgentToolDefinitions(
          createToolContext(principal, threadId),
        );
        return executeTool(
          name,
          callDefinitions[name] as RuntimeToolDefinition,
          input,
        );
      },
    );
  }

  const confirmDefinition = buildMcpConfirmProposalTool({
    organizationId: principal.organizationId,
    db,
    userId: principal.userId,
  }) as RuntimeToolDefinition;
  server.registerTool(
    "confirm_proposal",
    {
      description: confirmDefinition.description,
      inputSchema: confirmDefinition.inputSchema,
    },
    async (input) => executeTool("confirm_proposal", confirmDefinition, input),
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
