import { randomUUID } from "node:crypto";
import { getOrgContext } from "@/lib/tenant";
import {
  isVoiceDictationAvailable,
  transcribeVoiceDictation,
  VoiceTranscriptionError,
} from "@/lib/voice-dictate";
import {
  CRM_OBSERVABILITY_SERVICE_NAME,
  CRM_OBSERVABILITY_SERVICE_SLUG,
  reportAiEventBestEffort,
} from "@/lib/observability";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const GROQ_TIMEOUT_MS = 30_000;

function reportVoiceDictation(
  executionId: string,
  sizeBytes: number,
  status: "success" | "error",
) {
  // Do not include audio, transcript, user, tenant, model, or provider errors.
  reportAiEventBestEffort({
    execution_id: executionId,
    status,
    service_name: CRM_OBSERVABILITY_SERVICE_NAME,
    service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
    usage_kind: "transcription",
    metadata: { bytes: sizeBytes, provider: "groq" },
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!isVoiceDictationAvailable()) {
    return Response.json(
      { error: "El dictado no está configurado." },
      { status: 503 },
    );
  }

  const formData = await req.formData().catch(() => null);
  const audio = formData?.get("audio");
  if (!(audio instanceof File)) {
    return Response.json(
      { error: "Falta el archivo de audio." },
      { status: 400 },
    );
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "El audio supera el máximo de 15 MB." },
      { status: 413 },
    );
  }

  if (audio.size === 0) {
    return Response.json({ error: "El audio está vacío." }, { status: 422 });
  }

  const executionId = `voice-dictation:${randomUUID()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  const abortOnClientClose = () => controller.abort();
  req.signal.addEventListener("abort", abortOnClientClose, { once: true });

  try {
    const text = await transcribeVoiceDictation(audio, controller.signal);
    reportVoiceDictation(executionId, audio.size, "success");
    return Response.json({ text });
  } catch (error) {
    if (req.signal.aborted) {
      // The browser no longer needs the result; the upstream request was
      // aborted through the shared controller above.
      return new Response(null, { status: 499 });
    }

    reportVoiceDictation(executionId, audio.size, "error");
    const message =
      error instanceof VoiceTranscriptionError
        ? error.message
        : "No se pudo transcribir el audio. Intentá nuevamente.";
    return Response.json({ error: message }, { status: 422 });
  } finally {
    clearTimeout(timeout);
    req.signal.removeEventListener("abort", abortOnClientClose);
  }
}
