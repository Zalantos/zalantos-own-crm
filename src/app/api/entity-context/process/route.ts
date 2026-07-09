import { NextResponse, type NextRequest } from "next/server";
import { forOrg } from "@/lib/tenant";
import { runEntityContextPipeline } from "@/lib/entity-context/pipeline";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";

// Internal worker: process one source by id (CRON_SECRET).
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!isCronSecretConfigured(cronSecret)) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
    sourceId?: string;
  };

  if (body.organizationId && body.sourceId) {
    try {
      await runEntityContextPipeline(
        forOrg(body.organizationId),
        body.organizationId,
        body.sourceId,
      );
      return NextResponse.json({ ok: true, sourceId: body.sourceId });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          sourceId: body.sourceId,
          error: error instanceof Error ? error.message : "Error desconocido",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "organizationId y sourceId son requeridos" },
    { status: 400 },
  );
}
