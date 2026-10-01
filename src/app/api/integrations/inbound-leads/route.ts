import { NextResponse, type NextRequest } from "next/server";
import { forOrg } from "@/lib/tenant";
import { inboundLeadPayloadSchema } from "@/lib/zod/inbound-lead";
import { authorizeInboundLeadRequest } from "@/lib/inbound-leads/auth";
import { ingestInboundLead } from "@/lib/inbound-leads/ingest";

// POST /api/integrations/inbound-leads — recibe leads externos (hoy:
// formulario web de Zalantos vía n8n, source="website_contact") y los deja en
// la bandeja de revisión (/leads). NUNCA crea Company/Person/Opportunity acá;
// eso es responsabilidad exclusiva de la conversión manual en /leads/[id].
//
// Idempotencia: @@unique([organizationId, source, externalId]) en DB. Se
// intenta el create directo y se resuelve el conflicto P2002 con un lookup,
// en vez de find-then-create (vulnerable a condiciones de carrera con
// reintentos concurrentes de n8n).
export async function POST(request: NextRequest) {
  const auth = await authorizeInboundLeadRequest(
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = inboundLeadPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = forOrg(auth.organizationId);

  try {
    const result = await ingestInboundLead(db, auth.organizationId, parsed.data);
    return NextResponse.json(
      { ok: true, created: result.created, inboundLeadId: result.inboundLeadId },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    console.error("[inbound-leads] create error", error);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}
