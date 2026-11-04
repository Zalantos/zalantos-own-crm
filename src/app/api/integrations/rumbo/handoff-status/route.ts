import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prismaSystem } from "@/lib/prisma";
import { forOrg } from "@/lib/tenant";
import { isCronSecretConfigured } from "@/lib/internal-auth";
import { configuredSecrets, matchesAnySecret } from "@/lib/integrations/inbound-auth";
import { decryptSecret } from "@/lib/crypto";
import { appendTimelineEvent } from "@/lib/timeline";

const payloadSchema = z.object({
  handoff_id: z.string().min(1).max(100),
  status: z.enum(["confirmed", "failed"]),
  rumbo_project_id: z.string().max(200).optional(),
  rumbo_project_url: z.url().max(500).optional(),
  error: z.string().max(2000).optional(),
});

// POST /api/integrations/rumbo/handoff-status — Rumbo (o n8n en su nombre)
// confirma o rechaza un traspaso. Es la ÚNICA vía para marcar "confirmed".
// Idempotente: repetir la misma confirmación no cambia nada.
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  // Sin sesión: la org se deriva del handoff (lookup system) y luego todo
  // corre scopeado con forOrg.
  const located = await prismaSystem.rumboHandoff.findUnique({
    where: { id: data.handoff_id },
    select: { organizationId: true, organization: { select: { integrationGatewaySecret: true } } },
  });
  // Acepta el secreto del gateway de la org (el mismo que firma el envío a
  // Rumbo) o los secretos globales ya configurados: siempre activo, sin
  // variables nuevas.
  let orgSecret: string | null = null;
  try {
    orgSecret = located?.organization.integrationGatewaySecret
      ? decryptSecret(located.organization.integrationGatewaySecret)
      : null;
  } catch {
    orgSecret = null;
  }
  const secrets = [
    ...(isCronSecretConfigured(orgSecret ?? undefined) ? [orgSecret as string] : []),
    ...configuredSecrets(["RUMBO_CALLBACK_SECRET", "INTEGRATION_GATEWAY_SECRET"]),
  ];
  if (secrets.length === 0) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }
  if (!matchesAnySecret(request.headers.get("authorization"), secrets)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!located) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const db = forOrg(located.organizationId);
  const handoff = await db.rumboHandoff.findUnique({
    where: { id: data.handoff_id },
    include: { opportunity: { select: { id: true, companyId: true } } },
  });
  if (!handoff) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (handoff.status === "confirmed") {
    return NextResponse.json({ ok: true, status: "confirmed", unchanged: true });
  }
  const now = new Date();
  await db.rumboHandoff.update({
    where: { id: handoff.id },
    data:
      data.status === "confirmed"
        ? {
            status: "confirmed",
            confirmedAt: now,
            rumboProjectId: data.rumbo_project_id ?? null,
            rumboProjectUrl: data.rumbo_project_url ?? null,
            lastError: null,
          }
        : { status: "failed", failedAt: now, lastError: data.error ?? "Rumbo rechazó el traspaso" },
  });
  await appendTimelineEvent(db, {
    organizationId: located.organizationId,
    companyId: handoff.opportunity.companyId,
    opportunityId: handoff.opportunity.id,
    type: "rumbo_handoff",
    title: data.status === "confirmed" ? "Rumbo confirmó el proyecto" : "Rumbo rechazó el traspaso",
    summary: data.status === "confirmed" ? (data.rumbo_project_id ?? null) : (data.error ?? null),
    refType: "rumbo_handoff",
    refId: handoff.id,
  });
  return NextResponse.json({ ok: true, status: data.status });
}
