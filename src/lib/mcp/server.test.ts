import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleMcpRequest } from "./server";
import type { McpPrincipal } from "./auth";

// Ejercita el servidor MCP real (registro de tools + validación de input del
// SDK) sin DB: tools/list no consulta nada y un input inválido se rechaza
// antes de llegar al handler.

const principal: McpPrincipal = {
  userId: "user-1",
  organizationId: "org-1",
  tokenId: "token-1",
  agentThreadId: "thread-1",
};

type JsonSchema = { required?: string[]; properties?: Record<string, unknown> };
type ListedTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

async function rpc(method: string, params: Record<string, unknown>) {
  const response = await handleMcpRequest(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    principal,
  );
  return (await response.json()) as {
    result?: Record<string, unknown>;
    error?: { message: string };
  };
}

async function listTools(): Promise<ListedTool[]> {
  const body = await rpc("tools/list", {});
  return (body.result?.tools ?? []) as ListedTool[];
}

const EXISTING_TOOLS = [
  "search_crm",
  "get_company_snapshot",
  "create_note",
  "create_task",
  "update_record_fields",
  "list_meetings",
  "get_meeting",
  "get_record_timeline",
  "confirm_proposal",
];

const NEW_TOOLS: Record<string, string[]> = {
  create_activity: ["companyId", "type", "title", "date"],
  create_meeting: ["companyId", "title", "date"],
  update_task: ["taskId"],
  complete_task: ["taskId"],
  list_tasks: [],
  list_companies: [],
  list_people: [],
  list_team_members: [],
  list_notes: [],
  update_note: ["noteId"],
  list_activities: [],
  update_activity: ["activityId"],
  update_meeting: ["meetingId"],
};

describe("MCP: herramientas nuevas", () => {
  it("expone las tools nuevas con sus campos requeridos y la regla de ids", async () => {
    const tools = await listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const [name, required] of Object.entries(NEW_TOOLS)) {
      const tool = byName.get(name);
      assert.ok(tool, `falta la tool ${name}`);
      assert.deepEqual(
        [...(tool.inputSchema.required ?? [])].sort(),
        [...required].sort(),
        `required de ${name}`,
      );
      assert.match(tool.description, /nunca inventes un id/);
    }
    for (const name of [
      "create_activity",
      "create_meeting",
      "update_task",
      "complete_task",
      "update_note",
      "update_activity",
      "update_meeting",
    ]) {
      assert.match(
        byName.get(name)!.description,
        /En MCP esta acción queda escrita al instante/,
      );
    }
    const createTask = byName.get("create_task")!;
    assert.ok(createTask.inputSchema.properties?.assigneeEmail);
    assert.ok(createTask.inputSchema.properties?.priority);
    assert.ok(createTask.inputSchema.properties?.plannedDate);
    assert.ok(createTask.inputSchema.properties?.blockedReason);
    assert.ok(createTask.inputSchema.properties?.completedById);

    const updateTask = byName.get("update_task")!;
    assert.ok(updateTask.inputSchema.properties?.plannedDate);
    assert.ok(updateTask.inputSchema.properties?.blockedReason);
    assert.ok(updateTask.inputSchema.properties?.completedById);

    const createCompany = byName.get("create_company")!;
    assert.ok(createCompany.inputSchema.properties?.potentialValue);
    assert.ok(createCompany.inputSchema.properties?.nextStepDueDate);
    assert.ok(createCompany.inputSchema.properties?.lastContactAt);

    const createContact = byName.get("create_contact")!;
    assert.ok(createContact.inputSchema.properties?.linkedinUrl);
    assert.ok(createContact.inputSchema.properties?.notes);

    const createOpportunity = byName.get("create_opportunity")!;
    assert.ok(createOpportunity.inputSchema.properties?.probability);
    assert.ok(createOpportunity.inputSchema.properties?.decisionMakerId);
    assert.ok(createOpportunity.inputSchema.properties?.expectedCloseDate);
  });

  it("mantiene las tools existentes y su regla de ids", async () => {
    const tools = await listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of EXISTING_TOOLS) assert.ok(byName.has(name), name);
    assert.match(
      byName.get("create_note")!.description,
      /En MCP esta acción queda escrita al instante\. Resolvé ids con search_crm cuando corresponda; nunca inventes un id\.$/,
    );
    assert.match(
      byName.get("search_crm")!.description,
      /Resolvé ids con search_crm cuando corresponda; nunca inventes un id\.$/,
    );
  });

  it("rechaza campos faltantes antes de ejecutar", async () => {
    const cases: [string, Record<string, unknown>][] = [
      [
        "create_activity",
        { companyId: "co-1", type: "call", date: "2026-10-07" },
      ],
      ["create_meeting", { companyId: "co-1", title: "Reunión" }],
      ["update_task", { status: "done" }],
      ["complete_task", {}],
      ["update_note", {}],
      ["update_activity", {}],
      ["update_meeting", {}],
      ["list_tasks", { status: ["cancelled"] }],
    ];
    for (const [name, args] of cases) {
      const body = await rpc("tools/call", { name, arguments: args });
      const result = body.result as
        { isError?: boolean; content?: { text: string }[] } | undefined;
      // Debe ser el rechazo del schema, no un error posterior (p. ej. de DB).
      assert.equal(result?.isError, true, `${name} debería fallar`);
      assert.match(result?.content?.[0]?.text ?? "", /Input validation error/);
    }
  });
});
