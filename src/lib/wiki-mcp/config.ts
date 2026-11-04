import { WikiMcpError } from "./errors";

const DEFAULT_TIMEOUT_MS = 8_000;

export type WikiEntraSettings = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  resource: string;
};

export type WikiMcpSettings = {
  baseUrl: string;
  endpoint: URL;
  timeoutMs: number;
  // Token fijo de la Wiki. Si existe, no se usa Entra.
  token: string | null;
  entra: WikiEntraSettings | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new WikiMcpError("not_configured", `Falta ${name}`);
  }
  return value;
}

function parseBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WikiMcpError("not_configured", "WIKI_MCP_BASE_URL no es una URL");
  }
  // El Bearer viaja en cada petición: en producción no se admite texto plano.
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && process.env.NODE_ENV !== "production");
  if (!secure) {
    throw new WikiMcpError(
      "not_configured",
      "WIKI_MCP_BASE_URL debe usar https",
    );
  }
  return url;
}

// Lectura al momento de usarla, igual que runtime-config: la app arranca aunque
// la integración no esté configurada y el fallo aparece solo en la tool.
export function readWikiMcpSettings(): WikiMcpSettings {
  const baseUrl = parseBaseUrl(required("WIKI_MCP_BASE_URL"))
    .toString()
    .replace(/\/+$/, "");
  const timeoutMs = Number(process.env.WIKI_MCP_TIMEOUT_MS);
  const token = process.env.WIKI_MCP_TOKEN?.trim() || null;
  return {
    baseUrl,
    endpoint: new URL(`${baseUrl}/mcp`),
    token,
    entra: token
      ? null
      : {
          tenantId: required("WIKI_ENTRA_TENANT_ID"),
          clientId: required("WIKI_ENTRA_CLIENT_ID"),
          clientSecret: required("WIKI_ENTRA_CLIENT_SECRET"),
          resource: required("WIKI_ENTRA_RESOURCE").replace(/\/+$/, ""),
        },
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_TIMEOUT_MS,
  };
}

export function wikiAllowedOrgIds(): Set<string> {
  const raw = process.env.WIKI_MCP_ALLOWED_ORG_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}
