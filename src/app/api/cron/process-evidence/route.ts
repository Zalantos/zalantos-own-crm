import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runPipeline } from "@/lib/meeting-intelligence/pipeline";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";

// Catch-up worker: reprocesses meetings stuck in a non-terminal state (e.g. a
// server restart mid-pipeline). Same security model as /api/cron/check-overdue.
// `failed` is intentionally excluded — those need manual retry, not an auto-loop.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!isCronSecretConfigured(cronSecret)) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stuck = await prisma.meeting.findMany({
    where: {
      processingStatus: {
        in: ["pending", "extracting", "transcribing", "analyzing"],
      },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true },
  });

  let processed = 0;
  const errors: { meetingId: string; error: string }[] = [];
  for (const meeting of stuck) {
    try {
      await runPipeline(meeting.id);
      processed += 1;
    } catch (error) {
      errors.push({
        meetingId: meeting.id,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return NextResponse.json({ checked: stuck.length, processed, errors });
}
