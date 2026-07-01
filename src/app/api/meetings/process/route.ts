import { NextResponse, type NextRequest } from "next/server";
import { runPipeline } from "@/lib/meeting-intelligence/pipeline";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";

// Worker endpoint: runs the Meeting Intelligence pipeline for one meeting.
// Protected by CRON_SECRET (same scheme as /api/cron/check-overdue). Used for
// manual re-triggering and testing; the upload action runs the pipeline
// in-process via after() for the fast path.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!isCronSecretConfigured(cronSecret)) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    meetingId?: string;
  };
  if (!body.meetingId) {
    return NextResponse.json({ error: "meetingId requerido" }, { status: 400 });
  }

  try {
    await runPipeline(body.meetingId);
    return NextResponse.json({ ok: true, meetingId: body.meetingId });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    );
  }
}
