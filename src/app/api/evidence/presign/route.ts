import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import {
  buildEvidenceKey,
  createPresignedUploadUrl,
} from "@/lib/meeting-intelligence/storage/r2";

// Returns a presigned R2 PUT URL so the browser uploads evidence directly to
// storage. Authenticated via the user session (called from the client).
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { db } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    meetingId?: string;
    filename?: string;
    contentType?: string;
  };
  if (!body.meetingId || !body.filename || !body.contentType) {
    return NextResponse.json(
      { error: "meetingId, filename y contentType son requeridos" },
      { status: 400 },
    );
  }

  const meeting = await db.meeting.findUnique({
    where: { id: body.meetingId },
    select: { id: true },
  });
  if (!meeting) {
    return NextResponse.json(
      { error: "Meeting no encontrada" },
      { status: 404 },
    );
  }

  const key = buildEvidenceKey(body.meetingId, body.filename);
  const url = await createPresignedUploadUrl({
    key,
    contentType: body.contentType,
  });

  return NextResponse.json({ url, key });
}
