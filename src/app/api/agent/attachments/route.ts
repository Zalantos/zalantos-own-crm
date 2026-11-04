import { getOrgContext } from "@/lib/tenant";
import {
  classifyEvidence,
  extractText,
} from "@/lib/documents/extraction";

// El agente solo usa el texto extraído, que se guarda en la base; el archivo
// original no se almacena.
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const { user, org, db } = ctx;

  const formData = await req.formData();
  const file = formData.get("file");
  const text = formData.get("text");
  const filename = formData.get("filename");
  const threadId = formData.get("threadId");

  if (typeof threadId !== "string" || !threadId) {
    return Response.json(
      { error: "Falta threadId" },
      { status: 400 },
    );
  }

  const thread = await db.agentChatThread.findUnique({
    where: { id: threadId },
    select: { userId: true },
  });
  if (!thread || thread.userId !== user.id) {
    return Response.json({ error: "Thread no encontrado" }, { status: 404 });
  }

  if (!(file instanceof File)) {
    if (typeof text !== "string" || !text.trim()) {
      return Response.json(
        { error: "Falta archivo o texto" },
        { status: 400 },
      );
    }

    const extractedText = text.trim();
    const sizeBytes = Buffer.byteLength(extractedText, "utf8");
    if (sizeBytes > MAX_BYTES) {
      return Response.json(
        { error: "El texto supera el máximo de 15 MB" },
        { status: 413 },
      );
    }

    const title =
      typeof filename === "string" && filename.trim()
        ? filename.trim().slice(0, 120)
        : `texto-manual-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;

    const attachment = await db.agentAttachment.create({
      data: {
        organizationId: org.id,
        threadId,
        filename: title.endsWith(".txt") ? title : `${title}.txt`,
        mimeType: "text/plain",
        storagePath: "",
        sizeBytes,
        extractedText,
        status: "extracted",
        uploadedBy: user.id,
      },
      select: { id: true, filename: true },
    });

    return Response.json({
      id: attachment.id,
      filename: attachment.filename,
      chars: extractedText.length,
    });
  }

  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "El archivo supera el máximo de 15 MB" },
      { status: 413 },
    );
  }

  const { type, kind } = classifyEvidence(file.name, file.type);
  if (kind !== "text") {
    return Response.json(
      {
        error:
          "Solo se aceptan documentos (PDF, DOCX, TXT, MD).",
      },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let extractedText = "";
  try {
    extractedText = await extractText(type, buffer);
  } catch (error) {
    console.error("[agent] extracción falló", error);
    return Response.json(
      { error: "No se pudo extraer texto del documento" },
      { status: 422 },
    );
  }
  if (!extractedText) {
    return Response.json(
      { error: "El documento no contiene texto extraíble" },
      { status: 422 },
    );
  }

  const attachment = await db.agentAttachment.create({
    data: {
      organizationId: org.id,
      threadId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      storagePath: "",
      sizeBytes: file.size,
      extractedText,
      status: "extracted",
      uploadedBy: user.id,
    },
    select: { id: true, filename: true },
  });

  return Response.json({
    id: attachment.id,
    filename: attachment.filename,
    chars: extractedText.length,
  });
}
