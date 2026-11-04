import { z } from "zod";
import type { WikiEntraSettings } from "./config";
import { WikiMcpError } from "./errors";

// Margen para no enviar un token que caduque mientras viaja la petición.
const REFRESH_MARGIN_MS = 60_000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().positive(),
});

export type WikiTokenProvider = {
  getToken: () => Promise<string>;
  invalidate: (token: string) => void;
};

type TokenProviderOptions = {
  settings: WikiEntraSettings & { timeoutMs: number };
  fetchImpl?: typeof fetch;
  now?: () => number;
};

// Client credentials contra Entra. El token vive solo en memoria del proceso.
// El rol knowledge.read sale del registro de aplicación: se pide {resource}/.default
// porque un flujo de aplicación no admite scopes individuales.
export function createEntraTokenProvider({
  settings,
  fetchImpl = fetch,
  now = Date.now,
}: TokenProviderOptions): WikiTokenProvider {
  let cached: { token: string; refreshAt: number } | null = null;
  let pending: Promise<string> | null = null;

  async function requestToken(): Promise<string> {
    const url = `https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/token`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          scope: `${settings.resource}/.default`,
        }),
        signal: AbortSignal.timeout(settings.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new WikiMcpError(timedOut ? "timeout" : "unavailable");
    }

    if (response.status >= 500 || response.status === 429) {
      throw new WikiMcpError("unavailable");
    }
    if (!response.ok) {
      throw new WikiMcpError("unauthorized", "Entra rechazó las credenciales");
    }

    const parsed = tokenResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new WikiMcpError("invalid_response");
    }
    const lifetimeMs = parsed.data.expires_in * 1000;
    cached = {
      token: parsed.data.access_token,
      // Un token de vida muy corta se usa, pero no se reaprovecha.
      refreshAt: now() + Math.max(lifetimeMs - REFRESH_MARGIN_MS, 0),
    };
    return parsed.data.access_token;
  }

  return {
    getToken() {
      if (cached && now() < cached.refreshAt) {
        return Promise.resolve(cached.token);
      }
      pending ??= requestToken().finally(() => {
        pending = null;
      });
      return pending;
    },
    // Compara el token para que varios 401 simultáneos no descarten uno ya renovado.
    invalidate(token) {
      if (cached?.token === token) cached = null;
    },
  };
}
