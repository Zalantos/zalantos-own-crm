const GROQ_TRANSCRIPTIONS_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";

export const NO_VOICE_DETECTED_ERROR = "no se detectó voz en el audio";

type VoiceTranscriptionFailureKind = "no-speech" | "provider";

export class VoiceTranscriptionError extends Error {
  constructor(
    readonly kind: VoiceTranscriptionFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "VoiceTranscriptionError";
  }
}

function configuredGroqApiKey(): string | null {
  const value = process.env.GROQ_API_KEY?.trim();
  return value || null;
}

export function isVoiceDictationAvailable(): boolean {
  return configuredGroqApiKey() !== null;
}

function transcriptionModel(): string {
  return process.env.GROQ_TRANSCRIBE_MODEL?.trim() || "whisper-large-v3-turbo";
}

function textFromResponse(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("text" in body)) return null;
  const { text } = body;
  return typeof text === "string" ? text.trim() : null;
}

// This is deliberately separate from Meeting Intelligence: browser dictation
// is ephemeral, has its own product model default, and never persists audio.
export async function transcribeVoiceDictation(
  audio: File,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = configuredGroqApiKey();
  if (!apiKey) {
    throw new VoiceTranscriptionError(
      "provider",
      "El dictado no está configurado.",
    );
  }

  const formData = new FormData();
  formData.set("model", transcriptionModel());
  formData.set("response_format", "json");
  formData.set("file", audio, "dictado.webm");

  let response: Response;
  try {
    response = await fetch(GROQ_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new VoiceTranscriptionError(
      "provider",
      "No se pudo transcribir el audio. Intentá nuevamente.",
    );
  }

  if (!response.ok) {
    throw new VoiceTranscriptionError(
      "provider",
      `No se pudo transcribir el audio (Groq respondió ${response.status}).`,
    );
  }

  const payload = await response.json().catch(() => null);
  const text = textFromResponse(payload);
  if (!text) {
    throw new VoiceTranscriptionError("no-speech", NO_VOICE_DETECTED_ERROR);
  }

  return text;
}
