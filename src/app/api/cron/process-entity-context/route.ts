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
  const errors: { sourceId: string; error: string }[] = [];

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
      select: { id: true },
    });
    checked += stuck.length;

    for (const source of stuck) {
      try {
        await runEntityContextPipeline(db, org.id, source.id);
        processed += 1;
      } catch (error) {
        errors.push({
          sourceId: source.id,
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }
  }

  return NextResponse.json({ checked, processed, errors });
}
