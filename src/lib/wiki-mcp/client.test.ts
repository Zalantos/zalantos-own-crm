import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  WIKI_ALLOWED_TOOLS,
  createWikiMcpClient,
  createWikiTokenProvider,
  wikiDocumentUrl,
  type WikiToolName,
} from "./client";
import { readWikiMcpSettings } from "./config";
import type { WikiTokenProvider } from "./entra-token";

// Ejercita el protocolo real: cliente y servidor oficiales del SDK conectados por
// un fetch inyectado que hace de red. Los esquemas copian los de la Wiki
// (src/mcp/server.ts) y se publican también herramientas de escritura.

const DOCUMENT_ID = "6f1f4a52-8c55-4a43-9f39-1f6b1c7e2a10";
const SECRET_TEXT = "CLAUSULA-CONFIDENCIAL-123";

type ToolResult = {
  isError?: boolean;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
};

const okResult = (data: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
});

const errorResult = (status: number, error: string): ToolResult => ({
  isError: true,
  content: [
    {
      type: "text",
      text: JSON.stringify({ error, status, message: SECRET_TEXT }),
    },
  ],
});

const searchHit = {
  document_id: DOCUMENT_ID,
  chunk_id: "chunk-1",
  title: "Minuta Prisma",
  heading: "Acuerdos",
  snippet: "Se acordó enviar la propuesta",
  space_id: "corporativo",
  tree_path: "Clientes/Prisma",
  source_uri: "/p/corporativo/Clientes/Prisma",
  source_version: "3",
  source_modified_at: "2026-10-01T00:00:00.000Z",
  approval_status: "approved",
  score: 0.9,
  citation: { document_id: DOCUMENT_ID, chunk_id: "chunk-1", heading: null },
};

const documentDetail = {
  id: DOCUMENT_ID,
  title: "Minuta Prisma",
  source_uri: "/p/corporativo/Clientes/Prisma",
  source_type: "wiki",
  client_id: "cli-prisma",
  project_id: "prj-1",
  approval_status: "approved",
  source_modified_at: null,
  full_content: "Texto del documento",
  source_markdown: "---\nclasificacion: interno\n---\nTexto",
  chunks: [{ id: "chunk-1", ordinal: 0, heading: null, content: "Texto" }],
};

function createFakeWiki() {
  const state = {
    calls: [] as { name: string; args: Record<string, unknown> }[],
    requests: [] as { method: string; rpc: string | null; auth: string | null }[],
    search: (): ToolResult =>
      okResult({
        request_id: "r1",
        results: [searchHit],
        total: 1,
        no_evidence: false,
      }),
    read: (): ToolResult => okResult(documentDetail),
    httpStatus: ((): number | null => null) as (auth: string | null) => number | null,
    publishRead: true,
  };

  const handle = async (request: Request): Promise<Response> => {
    const auth = request.headers.get("authorization");
    const body = request.method === "POST" ? await request.clone().json() : null;
    state.requests.push({
      method: request.method,
      rpc: body?.method ?? null,
      auth,
    });
    const status = state.httpStatus(auth);
    if (status) return new Response("rechazado", { status });

    const server = new McpServer({ name: "fake-wiki", version: "1.0.0" });
    server.registerTool(
      "search_knowledge",
      {
        inputSchema: {
          query: z.string().min(2),
          client_id: z.string().optional(),
          project_id: z.string().optional(),
          limit: z.number().int().max(20).default(8),
        },
      },
      async (args) => {
        state.calls.push({ name: "search_knowledge", args });
        return state.search();
      },
    );
    if (state.publishRead) {
      server.registerTool(
        "read_document",
        { inputSchema: { document_id: z.uuid() } },
        async (args) => {
          state.calls.push({ name: "read_document", args });
          return state.read();
        },
      );
    }
    for (const name of ["create_page", "update_page", "propose_new_page"]) {
      server.registerTool(name, { inputSchema: {} }, async () => {
        state.calls.push({ name, args: {} });
        return okResult({ written: true });
      });
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  };

  const fetchImpl: typeof fetch = (input, init) =>
    handle(new Request(input, init));
  return { state, fetchImpl };
}

function fakeTokens() {
  let issued = 0;
  const invalidated: string[] = [];
  const tokens: WikiTokenProvider = {
    getToken: async () => `token-${invalidated.length + 1}`,
    invalidate: (token) => {
      invalidated.push(token);
      issued += 1;
    },
  };
  return { tokens, invalidated, renewals: () => issued };
}

const settings = {
  endpoint: new URL("https://wiki.test/mcp"),
  timeoutMs: 1_000,
};

function setup(fetchOverride?: typeof fetch) {
  const wiki = createFakeWiki();
  const auth = fakeTokens();
  const client = createWikiMcpClient({
    settings,
    tokens: auth.tokens,
    fetchImpl: fetchOverride ?? wiki.fetchImpl,
  });
  return { ...wiki, ...auth, client };
}

const searchParams = { query: "última reunión", limit: 5 };

describe("Wiki MCP: conexión y contrato", () => {
  let info: ReturnType<typeof mock.method>;
  beforeEach(() => {
    info = mock.method(console, "info", () => undefined);
  });
  afterEach(() => {
    info.mock.restore();
  });

  it("traduce los parámetros reales de search_knowledge", async () => {
    const { client, state } = setup();
    const response = await client.searchKnowledge({
      ...searchParams,
      clientId: "cli-prisma",
      projectId: "prj-1",
    });

    assert.deepEqual(state.calls[0], {
      name: "search_knowledge",
      args: {
        query: "última reunión",
        limit: 5,
        client_id: "cli-prisma",
        project_id: "prj-1",
      },
    });
    assert.equal(response.no_evidence, false);
    assert.equal(response.results[0].title, "Minuta Prisma");
    await client.close();
  });

  it("read_document usa document_id y descarta el texto duplicado", async () => {
    const { client, state } = setup();
    const document = await client.readDocument(DOCUMENT_ID);

    assert.deepEqual(state.calls[0].args, { document_id: DOCUMENT_ID });
    assert.equal(document.full_content, "Texto del documento");
    assert.equal("source_markdown" in document, false);
    assert.equal("chunks" in document, false);
    await client.close();
  });

  it("reutiliza la conexión entre llamadas y concurrencia", async () => {
    const { client, state } = setup();
    await Promise.all([
      client.searchKnowledge(searchParams),
      client.searchKnowledge(searchParams),
    ]);
    await client.readDocument(DOCUMENT_ID);

    const initializes = state.requests.filter((r) => r.rpc === "initialize");
    assert.equal(initializes.length, 1);
    await client.close();
  });

  it("solo permite las dos herramientas de la lista blanca", async () => {
    const { client, state } = setup();
    assert.deepEqual([...WIKI_ALLOWED_TOOLS], [
      "search_knowledge",
      "read_document",
    ]);

    for (const name of ["create_page", "update_page", "propose_new_page"]) {
      await assert.rejects(client.callTool(name as WikiToolName, {}), {
        kind: "access_denied",
      });
    }
    assert.equal(state.calls.length, 0);
    await client.close();
  });

  it("falla con claridad si la Wiki deja de publicar una herramienta", async () => {
    const { client, state } = setup();
    state.publishRead = false;
    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "invalid_response",
    });
  });
});

describe("Wiki MCP: errores", () => {
  let info: ReturnType<typeof mock.method>;
  beforeEach(() => {
    info = mock.method(console, "info", () => undefined);
  });
  afterEach(() => {
    info.mock.restore();
  });

  it("401: renueva el token y reintenta una sola vez", async () => {
    const { client, state, invalidated } = setup();
    state.httpStatus = (auth) => (auth === "Bearer token-1" ? 401 : null);

    const response = await client.searchKnowledge(searchParams);
    assert.equal(response.results.length, 1);
    assert.deepEqual(invalidated, ["token-1"]);
    await client.close();
  });

  it("401 persistente: unauthorized y sin bucle", async () => {
    const { client, state, renewals } = setup();
    state.httpStatus = () => 401;

    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "unauthorized",
    });
    const posts = state.requests.filter((r) => r.method === "POST");
    assert.equal(posts.length, 2);
    assert.equal(renewals(), 1);
  });

  it("403 HTTP: forbidden", async () => {
    const { client, state } = setup();
    state.httpStatus = () => 403;
    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "forbidden",
    });
  });

  it("404 HTTP es el endpoint, no un documento: unavailable", async () => {
    const { client, state } = setup();
    state.httpStatus = () => 404;
    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "unavailable",
    });
  });

  it("404 y 403 de herramienta no rompen la conexión", async () => {
    const { client, state } = setup();
    state.read = () => errorResult(404, "not_found");
    await assert.rejects(client.readDocument(DOCUMENT_ID), {
      kind: "not_found",
    });
    state.read = () => errorResult(403, "forbidden");
    await assert.rejects(client.readDocument(DOCUMENT_ID), (error: Error) => {
      assert.equal((error as Error & { kind: string }).kind, "forbidden");
      assert.equal(error.message.includes(SECRET_TEXT), false);
      return true;
    });

    await client.searchKnowledge(searchParams);
    const initializes = state.requests.filter((r) => r.rpc === "initialize");
    assert.equal(initializes.length, 1);
    await client.close();
  });

  it("no_evidence llega como respuesta válida, no como error", async () => {
    const { client, state } = setup();
    state.search = () =>
      okResult({ request_id: "r", results: [], total: 0, no_evidence: true });
    const response = await client.searchKnowledge(searchParams);
    assert.equal(response.no_evidence, true);
    assert.deepEqual(response.results, []);
    await client.close();
  });

  it("respuesta vacía o malformada: invalid_response", async () => {
    const { client, state } = setup();
    state.search = () => okResult({ unexpected: true });
    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "invalid_response",
    });
    state.search = () => ({ content: [{ type: "text", text: "no es json" }] });
    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "invalid_response",
    });
    await client.close();
  });

  it("Wiki caída: unavailable, y se recupera sola al volver", async () => {
    const wiki = createFakeWiki();
    let down = true;
    const { client } = setup((input, init) =>
      down
        ? Promise.reject(new TypeError("fetch failed"))
        : wiki.fetchImpl(input, init),
    );

    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "unavailable",
    });
    down = false;
    const response = await client.searchKnowledge(searchParams);
    assert.equal(response.results.length, 1);
    await client.close();
  });

  it("una Wiki que no responde agota el timeout", async () => {
    const wiki = createFakeWiki();
    wiki.state.search = () => okResult({});
    const client = createWikiMcpClient({
      settings: { ...settings, timeoutMs: 40 },
      tokens: fakeTokens().tokens,
      fetchImpl: (input, init) => {
        const isToolCall = String(init?.body ?? "").includes("tools/call");
        return isToolCall
          ? new Promise<Response>(() => undefined)
          : wiki.fetchImpl(input, init);
      },
    });

    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "timeout",
    });
  });

  it("los logs llevan métricas, nunca consulta ni contenido", async () => {
    const { client } = setup();
    await client.searchKnowledge({ query: SECRET_TEXT, limit: 3 });
    await client.close();

    const logged = JSON.stringify(info.mock.calls.map((call) => call.arguments));
    assert.equal(logged.includes(SECRET_TEXT), false);
    assert.equal(logged.includes("Minuta Prisma"), false);
    assert.equal(logged.includes("token-"), false);
    assert.match(logged, /search_knowledge/);
    assert.match(logged, /durationMs/);
  });
});

describe("Wiki MCP: enlaces", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.WIKI_MCP_BASE_URL = "https://wiki.zalantos.test";
    process.env.WIKI_ENTRA_TENANT_ID = "t";
    process.env.WIKI_ENTRA_CLIENT_ID = "c";
    process.env.WIKI_ENTRA_CLIENT_SECRET = "s";
    process.env.WIKI_ENTRA_RESOURCE = "api://r";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("resuelve rutas de la Wiki y respeta URLs de SharePoint", () => {
    assert.equal(
      wikiDocumentUrl("/p/corporativo/Clientes/Prisma"),
      "https://wiki.zalantos.test/p/corporativo/Clientes/Prisma",
    );
    assert.equal(
      wikiDocumentUrl("https://zalantos.sharepoint.com/sites/a/doc.pdf"),
      "https://zalantos.sharepoint.com/sites/a/doc.pdf",
    );
  });

  it("descarta esquemas no navegables", () => {
    assert.equal(wikiDocumentUrl("javascript:alert(1)"), null);
    assert.equal(wikiDocumentUrl("file:///etc/passwd"), null);
  });
});

describe("Wiki MCP: credenciales", () => {
  const env = { ...process.env };
  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("WIKI_")) delete process.env[key];
    }
    process.env.WIKI_MCP_BASE_URL = "https://wiki.zalantos.test";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("con WIKI_MCP_TOKEN no hacen falta las variables de Entra", async () => {
    process.env.WIKI_MCP_TOKEN = "zwiki_abc";
    const settings = readWikiMcpSettings();
    assert.equal(settings.entra, null);
    assert.equal(
      await createWikiTokenProvider(settings).getToken(),
      "zwiki_abc",
    );
  });

  it("sin token ni Entra queda not_configured", () => {
    assert.throws(readWikiMcpSettings, { kind: "not_configured" });
  });

  it("un token fijo rechazado termina en unauthorized, sin bucle", async () => {
    const wiki = createFakeWiki();
    wiki.state.httpStatus = () => 401;
    const client = createWikiMcpClient({
      settings,
      tokens: createWikiTokenProvider({
        token: "zwiki_caducado",
        entra: null,
        timeoutMs: 1_000,
      }),
      fetchImpl: wiki.fetchImpl,
    });
    const info = mock.method(console, "info", () => undefined);
    await assert.rejects(client.searchKnowledge(searchParams), {
      kind: "unauthorized",
    });
    info.mock.restore();
    assert.equal(wiki.state.requests.length, 2);
    assert.equal(wiki.state.requests[0].auth, "Bearer zwiki_caducado");
  });
});
