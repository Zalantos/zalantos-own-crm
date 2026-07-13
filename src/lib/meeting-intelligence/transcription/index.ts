// Audio/video → text via Groq whisper-large-v3.
//
// PORT POINT: the ffmpeg compression + >25MB chunking strategy comes from the
// existing Python service. `compressAudio` below is a faithful-but-minimal
// stand-in (mono/16kHz/low-bitrate mp3, the Whisper-friendly baseline). When
// you paste the Python file, replace `compressAudio` / add `chunkAudio` here
// keeping the exact flags and thresholds — the rest of the pipeline is stable.

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { toFile } from "groq-sdk";
import { groqConfig } from "@/lib/meeting-intelligence/config";
import { groqClient } from "@/lib/meeting-intelligence/groq-client";
import {
  CRM_OBSERVABILITY_SERVICE_NAME,
  CRM_OBSERVABILITY_SERVICE_SLUG,
  reportAiEventBestEffort,
} from "@/lib/observability";

// Groq's transcription endpoint rejects files above 25MB. We compress before
// that ceiling and leave a margin.
const MAX_GROQ_BYTES = 24 * 1024 * 1024;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", (err) =>
      reject(
        new Error(
          `No se pudo ejecutar ffmpeg (¿está instalado en la imagen?): ${err.message}`,
        ),
      ),
    );
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg salió con código ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Compress to a Whisper-friendly mono 16kHz mp3. Baseline until the Python
// logic is ported.
async function compressAudio(input: Buffer, filename: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "mi-audio-"));
  const inPath = path.join(dir, filename.replace(/[^a-zA-Z0-9._-]/g, "_"));
  const outPath = path.join(dir, "compressed.mp3");
  try {
    await writeFile(inPath, input);
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
      outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const executionId = `transcription:${randomUUID()}`;
  const startedAt = new Date();
  const model = groqConfig.transcriptionModel;

  try {
    let payload = buffer;
    let name = filename;

    if (payload.byteLength > MAX_GROQ_BYTES) {
      payload = await compressAudio(buffer, filename);
      name = filename.replace(/\.[^.]+$/, "") + ".mp3";
    }

    if (payload.byteLength > MAX_GROQ_BYTES) {
      // PORT POINT: chunking. The Python service splits long audio and
      // concatenates transcripts. Wire that here.
      throw new Error(
        "El audio supera el límite de Groq incluso comprimido. Falta portar la lógica de chunking del servicio Python.",
      );
    }

    const transcription = await groqClient().audio.transcriptions.create({
      file: await toFile(payload, name),
      model,
      response_format: "json",
    });

    // Whisper no expone tokens en el SDK actual; reportamos la call sin usage.
    reportAiEventBestEffort({
      execution_id: executionId,
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      status: "success",
      workflow_name: "meeting-intelligence-transcription",
      source_type: "backend",
      service_name: CRM_OBSERVABILITY_SERVICE_NAME,
      service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
      flow_slug: "meeting-transcription",
      usage_kind: "transcription",
      calls: [{ provider: "groq", model }],
      metadata: { filename, bytes: payload.byteLength },
    });

    return (transcription as { text: string }).text.trim();
  } catch (error) {
    reportAiEventBestEffort({
      execution_id: executionId,
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      status: "error",
      error_message: error instanceof Error ? error.message : String(error),
      workflow_name: "meeting-intelligence-transcription",
      source_type: "backend",
      service_name: CRM_OBSERVABILITY_SERVICE_NAME,
      service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
      flow_slug: "meeting-transcription",
      usage_kind: "transcription",
      calls: [{ provider: "groq", model }],
      metadata: { filename },
    });
    throw error;
  }
}
