import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";

// Auth para los endpoints entrantes de Telegram (n8n → backend). Reutiliza el
// secreto compartido del gateway de integraciones (INTEGRATION_GATEWAY_SECRET):
// es el mismo Bearer que ya usa el gateway saliente (src/lib/integrations/gateway.ts),
// así el mismo secreto autentica CRM↔n8n en ambas direcciones. Se valida contra
// el fallback global de env (no el per-org encriptado) porque el canal entrante
// no conoce la organización antes de autenticar.

export type TelegramAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; error: string };

export function authorizeTelegramRequest(
  authHeader: string | null,
): TelegramAuthResult {
  const secret = process.env.INTEGRATION_GATEWAY_SECRET;
  if (!isCronSecretConfigured(secret)) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }
  if (!isAuthorized(authHeader, secret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
