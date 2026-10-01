import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";
import { prismaSystem } from "@/lib/prisma";

// Auth para POST /api/integrations/inbound-leads (n8n -> backend). Secreto
// dedicado (no el de INTEGRATION_GATEWAY_SECRET/Telegram) para no ampliar el
// blast radius de esos otros canales si este se filtra. El caller nunca elige
// la organización: se resuelve de una env var fija por slug, vía prismaSystem
// (el canal no tiene sesión web ni forma de probar pertenencia a un tenant).

export type InboundLeadAuthResult =
  | { ok: true; organizationId: string }
  | { ok: false; status: 401 | 500; error: string };

export async function authorizeInboundLeadRequest(
  authHeader: string | null,
): Promise<InboundLeadAuthResult> {
  const secret = process.env.INBOUND_LEADS_SECRET;
  if (!isCronSecretConfigured(secret)) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }
  if (!isAuthorized(authHeader, secret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const slug = process.env.INBOUND_LEADS_ORGANIZATION_SLUG;
  if (!slug) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }
  const org = await prismaSystem.organization.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  });
  if (!org?.isActive) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }

  return { ok: true, organizationId: org.id };
}
