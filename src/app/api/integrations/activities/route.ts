import { NextResponse, type NextRequest } from "next/server";
import { forOrg } from "@/lib/tenant";
import { authorizeOrgIntegrationRequest } from "@/lib/integrations/inbound-auth";
import {
  activityIngestSchema,
  ingestExternalActivity,
} from "@/lib/commercial/activity-ingest";

// POST /api/integrations/activities — registra interacciones ya ocurridas
// (email, WhatsApp, llamadas) enviadas por n8n. Idempotente por
// (source, external_id). Si ningún participante coincide con el CRM no crea
// nada y responde 202 unmatched (no se fabrican contactos).
export async function POST(request: NextRequest) {
  const auth = await authorizeOrgIntegrationRequest(
    request.headers.get("authorization"),
    // Mismos secretos que ya usa n8n: no requiere configuración adicional.
    ["COMMERCIAL_EVENTS_SECRET", "INBOUND_LEADS_SECRET", "INTEGRATION_GATEWAY_SECRET"],
  );
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = activityIngestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const result = await ingestExternalActivity(forOrg(auth.organizationId), auth.organizationId, parsed.data);
    const status = result.status === "created" ? 201 : result.status === "duplicate" ? 200 : 202;
    return NextResponse.json({ ok: true, ...result }, { status });
  } catch (error) {
    console.error("[integrations/activities] error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
