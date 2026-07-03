import { generateText, type ModelMessage } from "ai";
import { groqConfig } from "@/lib/meeting-intelligence/config";
import { buildSystemPrompt } from "@/lib/meeting-intelligence/prompts/loader";
import { crmAnalysisSchema } from "@/lib/meeting-intelligence/ai/schema";
import { resolveModel } from "@/lib/agent/model";
import type {
  CrmReasoningProvider,
  ReasoningResult,
} from "@/lib/meeting-intelligence/ai/provider";

// Reasoning model for meeting analysis, independent from the chat agent's
// AGENT_MODEL. Defaults to the historical Groq setup.
function meetingModelSpec(): string {
  return (
    process.env.MEETING_REASONING_MODEL || `groq/${groqConfig.reasoningModel}`
  );
}

// Removes accidental ```json fences some models add despite the JSON prompt.
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function complete(messages: ModelMessage[]): Promise<string> {
  const { text } = await generateText({
    model: resolveModel(meetingModelSpec()),
    temperature: 0.1,
    messages,
  });
  return text;
}

// AI SDK-based reasoning provider (any provider/model via env). Keeps the
// Zod-validation + repair-retry loop because weaker models occasionally break
// the JSON contract even with a strict prompt.
export const defaultReasoningProvider: CrmReasoningProvider = {
  async analyze({ snapshot, transcript }): Promise<ReasoningResult> {
    const system = buildSystemPrompt();
    const userContent = JSON.stringify({
      crm_state: snapshot,
      transcript,
    });

    const messages: ModelMessage[] = [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ];

    let raw = await complete(messages);

    try {
      const parsed = crmAnalysisSchema.parse(JSON.parse(stripFences(raw)));
      return { analysis: parsed, model: meetingModelSpec(), raw };
    } catch (firstError) {
      // Repair-retry: hand the invalid output + the error back to the model.
      const repairPrompt = [
        "Tu respuesta anterior no cumplió el esquema JSON requerido.",
        `Error: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
        "Devolvé ÚNICAMENTE el JSON corregido, respetando exactamente el formato pedido.",
        "Respuesta anterior:",
        raw,
      ].join("\n\n");

      raw = await complete([
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: repairPrompt },
      ]);

      const parsed = crmAnalysisSchema.parse(JSON.parse(stripFences(raw)));
      return { analysis: parsed, model: meetingModelSpec(), raw };
    }
  },
};
