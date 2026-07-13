import type { AiEvent } from "@/lib/observability/types";

const TIMEOUT_MS = 3000;

async function postOnce(
  url: string,
  apiKey: string,
  body: unknown,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`observability ingest ${response.status}: ${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function assertCallsShape(event: AiEvent): void {
  for (const call of event.calls ?? []) {
    if (!call.model) {
      console.warn("[observability] skip call without model");
      continue;
    }
    const promptTokens = call.promptTokens ?? 0;
    const cachedTokens = call.cachedTokens ?? 0;
    if (promptTokens < cachedTokens) {
      console.warn(
        "[observability] promptTokens < cachedTokens; sending anyway may 400",
        { model: call.model, promptTokens, cachedTokens },
      );
    }
  }
}

// Best-effort single-event ingest. Never throws to callers of the business flow.
export async function reportAiEvent(event: AiEvent): Promise<void> {
  const base = process.env.OBSERVABILITY_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.OBSERVABILITY_API_KEY;
  if (!base || !apiKey) {
    console.warn(
      "[observability] disabled: missing OBSERVABILITY_BASE_URL or OBSERVABILITY_API_KEY",
    );
    return;
  }
  if (!event.execution_id) {
    console.warn("[observability] skip: missing execution_id");
    return;
  }

  assertCallsShape(event);

  const url = `${base}/api/v1/ingest/ai-event`;
  try {
    await postOnce(url, apiKey, event);
  } catch {
    try {
      // Retry idempotente: mismo execution_id no duplica en el server.
      await postOnce(url, apiKey, event);
    } catch (retryError) {
      console.error("[observability] reportAiEvent failed", retryError);
    }
  }
}

// Fire-and-forget wrapper so callers never await Observability.
export function reportAiEventBestEffort(event: AiEvent): void {
  void reportAiEvent(event).catch((error) => {
    console.error("[observability] unexpected reporter error", error);
  });
}
