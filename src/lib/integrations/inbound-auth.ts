import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/internal-auth";
import { prismaSystem } from "@/lib/prisma";

export type IntegrationAuthResult =
  | { ok: true; organizationId: string }
  | { ok: false; status: 401 | 500; error: string };

// Secretos aceptados por un canal entrante: el dedicado (si existe) y los ya
// configurados para n8n, así el canal funciona siempre sin variables nuevas.
export function configuredSecrets(envNames: string[]): string[] {
  return envNames
    .map((name) => process.env[name])
    .filter((secret): secret is string => isCronSecretConfigured(secret));
}

export function matchesAnySecret(authHeader: string | null, secrets: string[]) {
  return secrets.some((secret) => isAuthorized(authHeader, secret));
}

// Auth genérica para canales entrantes n8n → CRM. La organización la fija el
// servidor (env por slug), nunca el caller.
export async function authorizeOrgIntegrationRequest(
  authHeader: string | null,
  secretEnvNames: string[],
): Promise<IntegrationAuthResult> {
  const secrets = configuredSecrets(secretEnvNames);
  if (secrets.length === 0) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }
  if (!matchesAnySecret(authHeader, secrets)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const slug =
    process.env.INTEGRATIONS_ORGANIZATION_SLUG ??
    process.env.INBOUND_LEADS_ORGANIZATION_SLUG;
  if (!slug) return { ok: false, status: 500, error: "Server misconfigured" };
  const org = await prismaSystem.organization.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  });
  if (!org?.isActive) return { ok: false, status: 500, error: "Server misconfigured" };
  return { ok: true, organizationId: org.id };
}
