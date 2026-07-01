import Groq from "groq-sdk";
import { groqConfig } from "@/lib/meeting-intelligence/config";

// Single Groq client reused for both transcription (whisper) and reasoning (llama).
let client: Groq | undefined;

export function groqClient(): Groq {
  if (!client) {
    client = new Groq({ apiKey: groqConfig.apiKey });
  }
  return client;
}
