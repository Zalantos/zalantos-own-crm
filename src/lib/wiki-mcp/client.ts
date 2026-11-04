import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { readWikiMcpSettings, type WikiMcpSettings } from "./config";
import {
  createEntraTokenProvider,
  type WikiTokenProvider,
} from "./entra-token";
import { WikiMcpError, type WikiErrorKind } from "./errors";
import {
  wikiDocumentSchema,
  wikiSearchResponseSchema,
  type WikiDocument,
  type WikiSearchResponse,
} from "./schemas";

// Única lista de herramientas remotas que el CRM puede invocar. El servidor
// publica más (propose_*, create_page, update_page...): nunca se listan al modelo
// ni se pueden llamar desde aquí.
export const WIKI_ALLOWED_TOOLS = ["search_knowledge", "read_document"] as const;
export type WikiToolName = (typeof WIKI_ALLOWED_TOOLS)[number];

const ALLOWED_TOOLS = new Set<string>(WIKI_ALLOWED_TOOLS);

export type WikiSearchParams = {
  query: string;
  clientId?: string;
  projectId?: string;
  limit: number;
};

export type WikiMcpClient = {
  searchKnowledge: (params: WikiSearchParams) => Promise<WikiSearchResponse>;
  readDocument: (documentId: string) => Promise<WikiDocument>;
  callTool: (name: WikiToolName, args: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<void>;
};

type ClientOptions = {
  settings: Pick<WikiMcpSettings, "endpoint" | "timeoutMs">;
  tokens: WikiTokenProvider;
  fetchImpl?: typeof fetch;
};

function kindFromHttpStatus(status: number | undefined): WikiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  // Un 404 HTTP es el endpoint, no un documento: esos llegan como error de tool.
  return "unavailable";
}

function toWikiMcpError(error: unknown): WikiMcpError {
  if (error instanceof WikiMcpError) return error;
  if (error instanceof StreamableHTTPError) {
    return new WikiMcpError(kindFromHttpStatus(error.code));
  }
  if (error instanceof McpError) {
    if (error.code === ErrorCode.RequestTimeout) {
      return new WikiMcpError("timeout");
    }
    if (error.code === ErrorCode.InvalidParams) {
      return new WikiMcpError("invalid_request");
    }
    return new WikiMcpError("unavailable");
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new WikiMcpError("timeout");
  }
  return new WikiMcpError("unavailable");
}

type ToolResultShape = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
};

function firstText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const block: unknown = content[0];
  if (block && typeof block === "object" && "text" in block) {
    return typeof block.text === "string" ? block.text : null;
  }
  return null;
}

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// La Wiki responde los errores de herramienta como JSON { error, status, message }
// dentro de un resultado isError. El mensaje remoto se descarta.
function toolResultError(result: ToolResultShape): WikiMcpError {
  const payload = parseJson(firstText(result.content));
  const status =
    payload && typeof payload === "object" && "status" in payload
      ? payload.status
      : undefined;
  if (status === 404) return new WikiMcpError("not_found");
  if (status === 400 || status === 422) {
    return new WikiMcpError("invalid_request");
  }
  return new WikiMcpError(
    kindFromHttpStatus(typeof status === "number" ? status : undefined),
  );
}

function parseToolPayload<Schema extends z.ZodType>(
  schema: Schema,
  payload: unknown,
): z.output<Schema> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new WikiMcpError("invalid_response");
  }
  return parsed.data;
}

// Métricas técnicas: nunca la consulta, el texto recuperado ni identificadores.
function logCall(tool: string, startedAt: number, error?: WikiMcpError) {
  console.info(
    "[wiki-mcp]",
    JSON.stringify({
      tool,
      durationMs: Date.now() - startedAt,
      status: error ? "error" : "success",
      ...(error ? { errorType: error.kind } : {}),
    }),
  );
}

export function createWikiMcpClient({
  settings,
  tokens,
  fetchImpl = fetch,
}: ClientOptions): WikiMcpClient {
  let connection: Promise<Client> | null = null;

  // Inyecta el Bearer por petición, de modo que renovar el token no obliga a
  // reconectar. Un 401 se reintenta una sola vez con un token nuevo.
  const authenticatedFetch: typeof fetch = async (input, init) => {
    const send = (token: string) => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${token}`);
      return fetchImpl(input, { ...init, headers });
    };
    const token = await tokens.getToken();
    const response = await send(token);
    if (response.status !== 401) return response;
    await response.body?.cancel();
    tokens.invalidate(token);
    return send(await tokens.getToken());
  };

  async function assertContract(client: Client) {
    const published = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.listTools(
        cursor ? { cursor } : undefined,
        { timeout: settings.timeoutMs },
      );
      page.tools.forEach((tool) => published.add(tool.name));
      cursor = page.nextCursor;
    } while (cursor);
    if (WIKI_ALLOWED_TOOLS.some((name) => !published.has(name))) {
      throw new WikiMcpError("invalid_response");
    }
  }

  async function connect(): Promise<Client> {
    const client = new Client({ name: "crm-zalantos", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(settings.endpoint, {
      fetch: authenticatedFetch,
    });
    try {
      await client.connect(transport, { timeout: settings.timeoutMs });
      await assertContract(client);
      return client;
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  // Una sola conexión por proceso, compartida entre peticiones concurrentes.
  function getConnection(): Promise<Client> {
    if (!connection) {
      const attempt: Promise<Client> = connect().catch((error) => {
        if (connection === attempt) connection = null;
        throw error;
      });
      connection = attempt;
    }
    return connection;
  }

  async function dropConnection() {
    const current = connection;
    connection = null;
    const client = await current?.catch(() => null);
    await client?.close().catch(() => undefined);
  }

  async function callTool(name: WikiToolName, args: Record<string, unknown>) {
    // TypeScript ya lo impide; esto cubre un nombre construido en runtime.
    if (!ALLOWED_TOOLS.has(name)) {
      throw new WikiMcpError("access_denied", "Herramienta no permitida");
    }
    const startedAt = Date.now();
    try {
      const client = await getConnection();
      const result = (await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: settings.timeoutMs },
      )) as ToolResultShape;
      if (result.isError) throw toolResultError(result);
      const payload =
        result.structuredContent ?? parseJson(firstText(result.content));
      logCall(name, startedAt);
      return payload;
    } catch (error) {
      const wikiError = toWikiMcpError(error);
      logCall(name, startedAt, wikiError);
      // Un error de herramienta deja la conexión sana; uno de red o de auth no.
      if (!(error instanceof WikiMcpError)) await dropConnection();
      throw wikiError;
    }
  }

  return {
    callTool,
    close: dropConnection,
    async searchKnowledge({ query, clientId, projectId, limit }) {
      const payload = await callTool("search_knowledge", {
        query,
        limit,
        ...(clientId ? { client_id: clientId } : {}),
        ...(projectId ? { project_id: projectId } : {}),
      });
      return parseToolPayload(wikiSearchResponseSchema, payload);
    },
    async readDocument(documentId) {
      const payload = await callTool("read_document", {
        document_id: documentId,
      });
      return parseToolPayload(wikiDocumentSchema, payload);
    },
  };
}

// Un token fijo no se puede renovar: si la Wiki lo rechaza (caducó o se revocó), el
// reintento del 401 falla igual y el agente recibe unauthorized.
export function createWikiTokenProvider(
  settings: Pick<WikiMcpSettings, "token" | "entra" | "timeoutMs">,
): WikiTokenProvider {
  const { token, entra, timeoutMs } = settings;
  if (token) {
    return { getToken: async () => token, invalidate: () => undefined };
  }
  if (!entra) throw new WikiMcpError("not_configured");
  return createEntraTokenProvider({ settings: { ...entra, timeoutMs } });
}

const globalForWiki = globalThis as unknown as {
  wikiMcpClient?: WikiMcpClient;
};

// Lanza not_configured si faltan variables. El singleton en globalThis mantiene
// la conexión y el token entre rutas y recargas en desarrollo.
export function getWikiMcpClient(): WikiMcpClient {
  if (!globalForWiki.wikiMcpClient) {
    const settings = readWikiMcpSettings();
    globalForWiki.wikiMcpClient = createWikiMcpClient({
      settings,
      tokens: createWikiTokenProvider(settings),
    });
  }
  return globalForWiki.wikiMcpClient;
}

// Convierte source_uri en un enlace: SharePoint trae una URL absoluta y las
// páginas de la Wiki una ruta relativa a su propio dominio. Cualquier otro
// esquema se descarta para no entregar al usuario un enlace no navegable.
export function wikiDocumentUrl(sourceUri: string): string | null {
  try {
    const url = new URL(sourceUri, readWikiMcpSettings().baseUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
