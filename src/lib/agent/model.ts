import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { agentConfig } from "./config";

// Resolves a "provider/model" spec to an AI SDK language model. Each provider
// reads its API key from the environment at call time so a missing key only
// fails when that provider is actually selected.
export function resolveModel(spec: string): LanguageModel {
  const separator = spec.indexOf("/");
  if (separator <= 0) {
    throw new Error(
      `Modelo inválido: "${spec}". Formato esperado: proveedor/modelo`,
    );
  }
  const provider = spec.slice(0, separator);
  const modelId = spec.slice(separator + 1);

  switch (provider) {
    case "groq":
      return createGroq()(modelId);
    case "anthropic":
      return createAnthropic()(modelId);
    case "openai":
      return createOpenAI()(modelId);
    default:
      throw new Error(
        `Proveedor de modelo no soportado: "${provider}" (groq | anthropic | openai)`,
      );
  }
}

export function resolveAgentModel(): LanguageModel {
  return resolveModel(agentConfig.modelSpec);
}
