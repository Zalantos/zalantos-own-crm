import { generateText, type ModelMessage } from "ai";
import { groqConfig } from "@/lib/meeting-intelligence/config";
import { resolveModel } from "@/lib/agent/model";
import {
  entityContextAnalysisSchema,
  type EntityContextAnalysis,
} from "@/lib/entity-context/schema";
import { buildEntityContextSystemPrompt } from "@/lib/entity-context/prompt";
import type { ContextEntityType } from "@/lib/entity-context/types";

function enrichmentModelSpec(): string {
  return (
    process.env.ENTITY_CONTEXT_MODEL ||
    process.env.MEETING_REASONING_MODEL ||
    `groq/${groqConfig.reasoningModel}`
  );
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function complete(
  instructions: string,
  messages: ModelMessage[],
): Promise<string> {
  const { text } = await generateText({
    model: resolveModel(enrichmentModelSpec()),
    temperature: 0.1,
    instructions,
    messages,
  });
  return text;
}

export type EntityContextReasoningResult = {
  analysis: EntityContextAnalysis;
  model: string;
  raw: string;
};

export async function analyzeEntityContext(params: {
  entityType: ContextEntityType;
  snapshot: unknown;
  sourceText: string;
}): Promise<EntityContextReasoningResult> {
  const system = buildEntityContextSystemPrompt(params.entityType);
  const userContent = JSON.stringify({
    crm_state: params.snapshot,
    source_text: params.sourceText,
  });

  const messages: ModelMessage[] = [{ role: "user", content: userContent }];

  let raw = await complete(system, messages);

  try {
    const parsed = entityContextAnalysisSchema.parse(
      JSON.parse(stripFences(raw)),
    );
    return { analysis: parsed, model: enrichmentModelSpec(), raw };
  } catch (firstError) {
    const repairPrompt = [
      "Tu respuesta anterior no cumplió el esquema JSON requerido.",
      `Error: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
      "Devolvé ÚNICAMENTE el JSON corregido, respetando exactamente el formato pedido.",
      "Respuesta anterior:",
      raw,
    ].join("\n\n");

    raw = await complete(system, [
      ...messages,
      { role: "assistant", content: raw },
      { role: "user", content: repairPrompt },
    ]);

    const parsed = entityContextAnalysisSchema.parse(
      JSON.parse(stripFences(raw)),
    );
    return { analysis: parsed, model: enrichmentModelSpec(), raw };
  }
}
