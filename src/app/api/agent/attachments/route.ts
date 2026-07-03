import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  classifyEvidence,
  extractText,
} from "@/lib/meeting-intelligence/extraction";
import {
  buildAgentAttachmentKey,
  putObject,
} from "@/lib/meeting-intelligence/storage/r2";

// Documents are small (unlike meeting audio), so they go through the request
// body directly instead of a presigned browser upload.
const MAX_BYTES = 15 * 1024 * 1024;

function r2Available(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET,
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const threadId = formData.get("threadId");

  if (!(file instanceof File) || typeof threadId !== "string" || !threadId) {
    return Response.json(
      { error: "Falta archivo o threadId" },
      { status: 400 },
    );
  }

  const thread = await prisma.agentChatThread.findUnique({
    where: { id: threadId },
    select: { userId: true },
  });
  if (!thread || thread.userId !== user.id) {
    return Response.json({ error: "Thread no encontrado" }, { status: 404 });
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
          "Solo se aceptan documentos (PDF, DOCX, TXT, MD). Para audio o video de reuniones, subilo desde la reunión.",
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

  // R2 keeps the original for audit, but the feature degrades to text-only
  // when it isn't configured instead of failing the upload.
  let storagePath = "";
  if (r2Available()) {
    try {
      storagePath = buildAgentAttachmentKey(threadId, file.name);
      await putObject({
        key: storagePath,
        contentType: file.type || "application/octet-stream",
        body: buffer,
      });
    } catch (error) {
      console.error(
        "[agent] subida a R2 falló, se guarda solo el texto",
        error,
      );
      storagePath = "";
    }
  }

  const attachment = await prisma.agentAttachment.create({
    data: {
      threadId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      storagePath,
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
