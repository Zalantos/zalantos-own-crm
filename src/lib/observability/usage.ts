import type { LanguageModelUsage } from "ai";
import type { AiCall } from "@/lib/observability/types";

export function parseModelSpec(spec: string): {
  provider: string;
  model: string;
} {
  const separator = spec.indexOf("/");
  if (separator <= 0) {
    return { provider: "unknown", model: spec };
  }
  return {
    provider: spec.slice(0, separator),
    model: spec.slice(separator + 1),
  };
}

// El AI SDK puede devolver "openai.responses" / "openai.chat"; el reporte
// de observabilidad usa solo el proveedor base ("openai").
export function normalizeObservabilityProvider(provider: string): string {
  const separator = provider.indexOf(".");
  return separator > 0 ? provider.slice(0, separator) : provider;
}

// Mapea usage del AI SDK al contrato Observability.
// promptTokens debe incluir cachedTokens (no restar). Si el proveedor reporta
// input sin cache, sumamos cacheRead para cumplir la convención.
export function aiCallFromLanguageModelUsage(
  provider: string,
  model: string,
  usage: LanguageModelUsage | undefined,
): AiCall {
  const cachedTokens = usage?.inputTokenDetails?.cacheReadTokens ?? 0;
  const inputTokens = usage?.inputTokens ?? 0;
  const promptTokens =
    inputTokens >= cachedTokens ? inputTokens : inputTokens + cachedTokens;

  return {
    provider: normalizeObservabilityProvider(provider),
    model,
    promptTokens,
    completionTokens: usage?.outputTokens ?? 0,
    cachedTokens,
  };
}

export function aiCallFromModelSpec(
  modelSpec: string,
  usage: LanguageModelUsage | undefined,
): AiCall {
  const { provider, model } = parseModelSpec(modelSpec);
  return aiCallFromLanguageModelUsage(provider, model, usage);
}
