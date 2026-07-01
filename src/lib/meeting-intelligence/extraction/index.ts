// Converts a piece of evidence into plain text. Every source format funnels
// through here so the rest of the pipeline only ever sees `extractedText`.

import mammoth from "mammoth";

export type ExtractableType = "pdf" | "docx" | "txt" | "md" | "transcript";

// Maps a mime type / filename to a normalized evidence type.
export function classifyEvidence(
  filename: string,
  mimeType: string,
): { type: string; kind: "text" | "audio" | "video" | "unknown" } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mt = mimeType.toLowerCase();

  if (mt.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg"].includes(ext)) {
    return { type: ext || "audio", kind: "audio" };
  }
  if (mt.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) {
    return { type: ext || "video", kind: "video" };
  }
  if (mt === "application/pdf" || ext === "pdf") return { type: "pdf", kind: "text" };
  if (
    mt.includes("wordprocessingml") ||
    mt === "application/msword" ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return { type: "docx", kind: "text" };
  }
  if (ext === "md" || mt === "text/markdown") return { type: "md", kind: "text" };
  if (mt.startsWith("text/") || ext === "txt") return { type: "txt", kind: "text" };
  return { type: ext || "unknown", kind: "unknown" };
}

export async function extractText(
  type: string,
  buffer: Buffer,
): Promise<string> {
  switch (type) {
    case "pdf": {
      // Import the internal entrypoint to avoid pdf-parse's debug-mode
      // top-level test-file read when the package index is required.
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
        data: Buffer,
      ) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text.trim();
    }
    case "docx":
    case "doc": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }
    case "txt":
    case "md":
    case "transcript":
    default:
      return buffer.toString("utf-8").trim();
  }
}
