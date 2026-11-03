import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";
import { prismaSystem } from "@/lib/prisma";

export type IntegrationAuthResult =
  | { ok: true; organizationId: string }
  | { ok: false; status: 401 | 500; error: string };

// Auth genérica para canales entrantes n8n → CRM con secreto dedicado por
// canal. La organización la fija el servidor (env por slug), nunca el caller.
export async function authorizeOrgIntegrationRequest(
  authHeader: string | null,
  secretEnv: string,
): Promise<IntegrationAuthResult> {
  const secret = process.env[secretEnv];
  if (!isCronSecretConfigured(secret)) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }
  if (!isAuthorized(authHeader, secret)) {
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
