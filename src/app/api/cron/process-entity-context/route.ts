import { NextResponse, type NextRequest } from "next/server";
import { prismaSystem } from "@/lib/prisma";
import { forOrg } from "@/lib/tenant";
import { runEntityContextPipeline } from "@/lib/entity-context/pipeline";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";

// Catch-up worker for entity context sources stuck mid-pipeline.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!isCronSecretConfigured(cronSecret)) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgs = await prismaSystem.organization.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let checked = 0;
  let processed = 0;
  const errors: { sourceIds: string[]; error: string }[] = [];

  for (const org of orgs) {
    const db = forOrg(org.id);
    const stuck = await db.entityContextSource.findMany({
      where: {
        status: {
          in: ["uploaded", "extracting", "extracted", "analyzing"],
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, entityType: true, entityId: true },
    });
    checked += stuck.length;

    // Agrupa por entidad para correr un solo análisis por lote.
    const batches = new Map<string, string[]>();
    for (const source of stuck) {
      const key = `${source.entityType}:${source.entityId}`;
      const batch = batches.get(key) ?? [];
      batch.push(source.id);
      batches.set(key, batch);
    }

    for (const sourceIds of batches.values()) {
      try {
        await runEntityContextPipeline(db, org.id, sourceIds);
        processed += sourceIds.length;
      } catch (error) {
        errors.push({
          sourceIds,
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }
  }

  return NextResponse.json({ checked, processed, errors });
}
