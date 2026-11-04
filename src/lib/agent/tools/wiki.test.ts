import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Tool } from "ai";
import { buildAgentTools, type AgentToolContext } from "@/lib/agent/executor";
import { buildAgentSystemPrompt } from "@/lib/agent/system-prompt";
import { WikiMcpError } from "@/lib/wiki-mcp/errors";
import { redactWikiToolParts } from "@/lib/wiki-mcp/redaction";
import type {
  WikiDocument,
  WikiSearchResponse,
  WikiSearchResult,
} from "@/lib/wiki-mcp/schemas";
import type { WikiSearchParams } from "@/lib/wiki-mcp/client";
import {
  buildWikiTools,
  createWikiTurnState,
  guardCriticalWikiActions,
  type WikiTurnState,
} from "./wiki";

const DOCUMENT_ID = "6f1f4a52-8c55-4a43-9f39-1f6b1c7e2a10";

const companies: Record<string, { id: string; name: string; wikiClientId: string | null }> = {
  "co-prisma": { id: "co-prisma", name: "Prisma Seguros", wikiClientId: "cli-prisma" },
  "co-traza": { id: "co-traza", name: "Traza", wikiClientId: null },
};

function hit(chunk: string, overrides: Partial<WikiSearchResult> = {}): WikiSearchResult {
  return {
    document_id: DOCUMENT_ID,
    chunk_id: chunk,
    title: `Documento ${chunk}`,
    heading: null,
    snippet: "Texto del fragmento",
    tree_path: null,
    source_uri: `/p/corporativo/${chunk}`,
    source_modified_at: null,
    ...overrides,
  };
}

const found = (...results: WikiSearchResult[]): WikiSearchResponse => ({
  results,
  no_evidence: results.length === 0,
});

function setup({
  pageCompanyId = null,
  search = async () => found(),
  read,
  authorize = async () => undefined,
}: {
  pageCompanyId?: string | null;
  search?: (params: WikiSearchParams) => Promise<WikiSearchResponse>;
  read?: (id: string) => Promise<WikiDocument>;
  authorize?: () => Promise<void>;
} = {}) {
  const searches: WikiSearchParams[] = [];
  const turn = createWikiTurnState();
  const ctx = {
    organizationId: "org-zalantos",
    userId: "u1",
    threadId: "t1",
    channel: "web",
    // forOrg devuelve null para una empresa de otra organización.
    db: {
      company: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          companies[where.id] ?? null,
      },
    },
    pageContext: pageCompanyId
      ? { description: "", companyId: pageCompanyId, opportunityId: null }
      : null,
  } as unknown as AgentToolContext;
  const tools = buildWikiTools(ctx, turn, {
    authorize,
    client: () => ({
      searchKnowledge: async (params) => {
        searches.push(params);
        return search(params);
      },
      readDocument: read ?? (async () => assert.fail("no debía leer")),
    }),
    documentUrl: (uri) => `https://wiki.test${uri}`,
  });
  return { tools, searches, turn };
}

describe("wiki_search_knowledge: vínculo con la empresa", () => {
  it("resuelve la empresa de la ficha y su wikiClientId sin que el usuario la nombre", async () => {
    const { tools, searches } = setup({ pageCompanyId: "co-prisma" });
    await tools.wiki_search_knowledge.execute({ query: "última reunión" });

    assert.equal(searches.length, 2);
    assert.equal(searches[0].clientId, "cli-prisma");
    assert.equal(searches[0].query, "última reunión");
    assert.equal(searches[1].clientId, undefined);
    assert.equal(searches[1].query, "Prisma Seguros última reunión");
  });

  it("sin wikiClientId busca solo por nombre", async () => {
    const { tools, searches } = setup();
    await tools.wiki_search_knowledge.execute({
      query: "documentación",
      companyId: "co-traza",
    });
    assert.equal(searches.length, 1);
    assert.equal(searches[0].clientId, undefined);
    assert.equal(searches[0].query, "Traza documentación");
  });

  it("companyId=null ignora la ficha para conocimiento general", async () => {
    const { tools, searches } = setup({ pageCompanyId: "co-prisma" });
    const result = await tools.wiki_search_knowledge.execute({
      query: "procedimiento de propuestas",
      companyId: null,
    });
    assert.equal(searches.length, 1);
    assert.equal(searches[0].query, "procedimiento de propuestas");
    assert.equal("company" in result ? result.company : "x", null);
  });

  it("una empresa de otro tenant no llega a la Wiki", async () => {
    const { tools, searches } = setup();
    const result = await tools.wiki_search_knowledge.execute({
      query: "contrato",
      companyId: "co-otro-tenant",
    });
    assert.match(String("error" in result && result.error), /no encontrada/);
    assert.equal(searches.length, 0);
  });

  it("el esquema no acepta client_id ni organizationId del modelo", () => {
    const { tools } = setup();
    const parsed = tools.wiki_search_knowledge.inputSchema.parse({
      query: "contrato",
      client_id: "cli-ajeno",
      organizationId: "org-ajena",
    });
    assert.deepEqual(parsed, { query: "contrato" });
  });

  it("clasifica y prioriza: client_id, mención del nombre y sin verificar", async () => {
    const { tools } = setup({
      pageCompanyId: "co-prisma",
      search: async ({ clientId }) =>
        clientId
          ? found(hit("verificado"))
          : found(
              hit("sin-vinculo", { title: "Prisma Ingeniería", snippet: "Otra empresa" }),
              hit("mencion", { snippet: "Reunión con PRISMA SEGUROS" }),
              hit("verificado"),
            ),
    });
    const result = await tools.wiki_search_knowledge.execute({ query: "reunión" });
    assert.ok("results" in result);
    assert.deepEqual(
      result.results.map((r) => [r.title, r.clientMatch]),
      [
        ["Documento verificado", "client_id"],
        ["Documento mencion", "name_mention"],
        ["Prisma Ingeniería", "unverified"],
      ],
    );
  });

  it("wikiProjectId solo se acepta si salió de un documento leído en el turno", async () => {
    const { tools, searches } = setup({
      read: async () => ({
        id: DOCUMENT_ID,
        title: "Doc",
        source_uri: "/p/x",
        project_id: "prj-1",
        full_content: "texto",
      }),
    });
    const rejected = await tools.wiki_search_knowledge.execute({
      query: "avance",
      companyId: null,
      wikiProjectId: "prj-1",
    });
    assert.ok("error" in rejected);
    assert.equal(searches.length, 0);

    await tools.wiki_read_document.execute({ documentId: DOCUMENT_ID });
    await tools.wiki_search_knowledge.execute({
      query: "avance",
      companyId: null,
      wikiProjectId: "prj-1",
    });
    assert.equal(searches[0].projectId, "prj-1");
  });
});

describe("wiki_search_knowledge: evidencia y fallos", () => {
  it("no_evidence: lo informa como resultado válido", async () => {
    const { tools } = setup();
    const result = await tools.wiki_search_knowledge.execute({
      query: "contrato inexistente",
      companyId: null,
    });
    assert.ok("no_evidence" in result);
    assert.equal(result.no_evidence, true);
    assert.equal("error" in result, false);
  });

  it("entrega título, enlace y fragmento acotado", async () => {
    const { tools } = setup({
      search: async () => found(hit("a", { snippet: "x".repeat(5000) })),
    });
    const result = await tools.wiki_search_knowledge.execute({
      query: "contrato",
      companyId: null,
    });
    assert.ok("results" in result);
    assert.equal(result.results[0].url, "https://wiki.test/p/corporativo/a");
    assert.equal(result.results[0].snippet.length, 700);
  });

  for (const kind of [
    "unavailable",
    "timeout",
    "unauthorized",
    "forbidden",
    "not_configured",
  ] as const) {
    it(`${kind}: es un error, nunca no_evidence`, async () => {
      const { tools } = setup({
        search: async () => {
          throw new WikiMcpError(kind);
        },
      });
      const result = await tools.wiki_search_knowledge.execute({
        query: "contrato",
        companyId: null,
      });
      assert.ok("error_type" in result);
      assert.equal(result.error_type, kind);
      assert.equal("no_evidence" in result, false);
    });
  }

  it("si falla una de las dos búsquedas no afirma ausencia de evidencia", async () => {
    const { tools } = setup({
      pageCompanyId: "co-prisma",
      search: async ({ clientId }) => {
        if (clientId) return found();
        throw new WikiMcpError("timeout");
      },
    });
    const result = await tools.wiki_search_knowledge.execute({ query: "contrato" });
    assert.ok("partial" in result);
    assert.equal(result.partial, true);
    assert.equal(result.no_evidence, false);
  });

  it("sin autorización no llama a la Wiki", async () => {
    const { tools, searches } = setup({
      authorize: async () => {
        throw new WikiMcpError("access_denied");
      },
    });
    const result = await tools.wiki_search_knowledge.execute({
      query: "contrato",
      companyId: null,
    });
    assert.ok("error_type" in result);
    assert.equal(result.error_type, "access_denied");
    assert.equal(searches.length, 0);
  });
});

describe("wiki_read_document", () => {
  const longDocument: WikiDocument = {
    id: DOCUMENT_ID,
    title: "Contrato APV",
    source_uri: "/p/corporativo/apv",
    client_id: "cli-apv",
    project_id: null,
    full_content: "a".repeat(12_000) + "b".repeat(100),
  };

  it("pagina el contenido dentro del límite", async () => {
    const { tools } = setup({ read: async () => longDocument });
    const first = await tools.wiki_read_document.execute({ documentId: DOCUMENT_ID });
    assert.ok("text" in first);
    assert.equal(first.text.length, 12_000);
    assert.equal(first.hasMore, true);
    assert.equal(first.url, "https://wiki.test/p/corporativo/apv");

    const second = await tools.wiki_read_document.execute({
      documentId: DOCUMENT_ID,
      offset: 12_000,
    });
    assert.ok("text" in second);
    assert.equal(second.text, "b".repeat(100));
    assert.equal(second.hasMore, false);
  });

  it("rechaza ids que no son UUID", () => {
    const { tools } = setup();
    const parsed = tools.wiki_read_document.inputSchema.safeParse({
      documentId: "../../admin",
    });
    assert.equal(parsed.success, false);
  });

  it("not_found y forbidden no rompen la conversación", async () => {
    for (const kind of ["not_found", "forbidden"] as const) {
      const { tools } = setup({
        read: async () => {
          throw new WikiMcpError(kind);
        },
      });
      const result = await tools.wiki_read_document.execute({
        documentId: DOCUMENT_ID,
      });
      assert.ok("error_type" in result);
      assert.equal(result.error_type, kind);
    }
  });
});

describe("Acciones críticas tras leer la Wiki", () => {
  const options = {} as Parameters<NonNullable<Tool["execute"]>>[1];

  function guarded(name: string, turn: WikiTurnState) {
    let executed = false;
    const tool = guardCriticalWikiActions(
      name,
      {
        execute: async () => {
          executed = true;
          return { status: "applied" };
        },
      } as unknown as Tool,
      turn,
    );
    return { tool, wasExecuted: () => executed };
  }

  const tainted = (): WikiTurnState => ({
    contentRead: true,
    projectIds: new Set(),
  });

  for (const name of [
    "change_stage",
    "set_opportunity_status",
    "convert_lead_to_opportunity",
    "confirm_pending_proposal",
  ]) {
    it(`${name} exige confirmación si entró contenido de la Wiki`, async () => {
      const { tool, wasExecuted } = guarded(name, tainted());
      const result = await tool.execute?.({}, options);
      assert.equal(wasExecuted(), false);
      assert.equal(
        (result as { status: string }).status,
        "confirmation_required",
      );
    });
  }

  it("update_record_fields no sirve para mover la etapa", async () => {
    const { tool, wasExecuted } = guarded("update_record_fields", tainted());
    await tool.execute?.(
      { updates: [{ field: "nextStep" }, { field: "stage" }] },
      options,
    );
    assert.equal(wasExecuted(), false);
  });

  it("no bloquea acciones de bajo impacto ni campos normales", async () => {
    const note = guarded("create_note", tainted());
    await note.tool.execute?.({}, options);
    assert.equal(note.wasExecuted(), true);

    const fields = guarded("update_record_fields", tainted());
    await fields.tool.execute?.({ updates: [{ field: "nextStep" }] }, options);
    assert.equal(fields.wasExecuted(), true);
  });

  it("sin contenido de Wiki en el turno no cambia nada", async () => {
    const { tool, wasExecuted } = guarded("change_stage", createWikiTurnState());
    await tool.execute?.({}, options);
    assert.equal(wasExecuted(), true);
  });

  it("una búsqueda sin resultados no marca el turno; una con resultados sí", async () => {
    const empty = setup();
    await empty.tools.wiki_search_knowledge.execute({
      query: "nada",
      companyId: null,
    });
    assert.equal(empty.turn.contentRead, false);

    const withHits = setup({ search: async () => found(hit("a")) });
    await withHits.tools.wiki_search_knowledge.execute({
      query: "algo",
      companyId: null,
    });
    assert.equal(withHits.turn.contentRead, true);
  });
});

describe("Agente: exposición de las tools", () => {
  const env = { ...process.env };
  const input = {
    organizationId: "org-zalantos",
    db: {} as AgentToolContext["db"],
    userId: "u1",
    threadId: "t1",
    channel: "web" as const,
    pageContext: null,
  };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("WIKI_")) delete process.env[key];
    }
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("un tenant no autorizado no recibe las tools ni la sección del prompt", () => {
    process.env.WIKI_MCP_ALLOWED_ORG_IDS = "otra-org";
    const names = Object.keys(buildAgentTools(input));
    assert.equal(names.some((name) => name.startsWith("wiki_")), false);
    assert.ok(names.includes("search_crm"));

    const prompt = buildAgentSystemPrompt({ orgName: "Cliente", pageContext: null });
    assert.equal(prompt.includes("Wiki"), false);
  });

  it("la organización autorizada recibe solo las dos tools de lectura", () => {
    process.env.WIKI_MCP_ALLOWED_ORG_IDS = "org-zalantos";
    const names = Object.keys(buildAgentTools(input)).filter((name) =>
      /wiki|propose_|create_page|update_page/.test(name),
    );
    assert.deepEqual(names.sort(), [
      "wiki_read_document",
      "wiki_search_knowledge",
    ]);
  });

  it("el prompt separa fuentes, exige citas y trata los documentos como no confiables", () => {
    const prompt = buildAgentSystemPrompt({
      orgName: "zalantos",
      pageContext: null,
      wikiEnabled: true,
    });
    assert.match(prompt, /## Wiki corporativa/);
    assert.match(prompt, /no_evidence/);
    assert.match(prompt, /datos no confiables/);
    assert.match(prompt, /No consultes la Wiki en cada mensaje/);
  });
});

describe("Persistencia del chat", () => {
  it("guarda la cita, nunca el texto recuperado", () => {
    const parts = [
      { type: "text", text: "respuesta" },
      {
        type: "tool-wiki_search_knowledge",
        output: {
          source: "wiki",
          results: [
            { documentId: "d1", title: "Minuta", url: "https://w/x", snippet: "SECRETO" },
          ],
        },
      },
      {
        type: "tool-wiki_read_document",
        output: { documentId: "d1", title: "Minuta", url: "https://w/x", text: "SECRETO" },
      },
      { type: "tool-search_crm", output: { results: [{ snippet: "se conserva" }] } },
    ];
    const redacted = redactWikiToolParts(parts);
    const wikiParts = JSON.stringify(redacted.slice(1, 3));

    assert.equal(wikiParts.includes("SECRETO"), false);
    assert.match(wikiParts, /Minuta/);
    assert.match(wikiParts, /https:\/\/w\/x/);
    assert.deepEqual(redacted[3], parts[3]);
  });

  it("conserva los errores para que el historial siga siendo legible", () => {
    const part = {
      type: "tool-wiki_search_knowledge",
      output: { error: "La Wiki no está disponible.", error_type: "unavailable" },
    };
    assert.deepEqual(redactWikiToolParts([part]), [part]);
  });
});
