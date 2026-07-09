import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import {
  buildEntityContextKey,
  createPresignedUploadUrl,
} from "@/lib/meeting-intelligence/storage/r2";
import {
  isContextEntityType,
  type ContextEntityType,
} from "@/lib/entity-context/types";
import { resolveContextEntity } from "@/lib/entity-context/resolve-entity";
import { classifyEvidence } from "@/lib/meeting-intelligence/extraction";

export async function POST(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { db } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    entityType?: string;
    entityId?: string;
    filename?: string;
    contentType?: string;
  };

  if (
    !body.entityType ||
    !body.entityId ||
    !body.filename ||
    !body.contentType
  ) {
    return NextResponse.json(
      {
        error: "entityType, entityId, filename y contentType son requeridos",
      },
      { status: 400 },
    );
  }

  if (!isContextEntityType(body.entityType)) {
    return NextResponse.json(
      { error: "entityType inválido" },
      { status: 400 },
    );
  }

  const entityType = body.entityType as ContextEntityType;
  const resolved = await resolveContextEntity(db, entityType, body.entityId);
  if (!resolved) {
    return NextResponse.json(
      { error: "Entidad no encontrada" },
      { status: 404 },
    );
  }

  const { kind } = classifyEvidence(body.filename, body.contentType);
  if (kind !== "text") {
    return NextResponse.json(
      {
        error:
          "Solo se admiten PDF, DOCX, TXT o Markdown. Audio/video va en Reuniones.",
      },
      { status: 400 },
    );
  }

  const key = buildEntityContextKey(entityType, body.entityId, body.filename);
  const url = await createPresignedUploadUrl({
    key,
    contentType: body.contentType,
  });

  return NextResponse.json({ url, key });
}
