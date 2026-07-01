import { groqConfig } from "@/lib/meeting-intelligence/config";
import { groqClient } from "@/lib/meeting-intelligence/groq-client";
import { buildSystemPrompt } from "@/lib/meeting-intelligence/prompts/loader";
import { crmAnalysisSchema } from "@/lib/meeting-intelligence/ai/schema";
import type {
  CrmReasoningProvider,
  ReasoningResult,
} from "@/lib/meeting-intelligence/ai/provider";

// Removes accidental ```json fences some models add despite JSON mode.
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function complete(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<string> {
  const completion = await groqClient().chat.completions.create({
    model: groqConfig.reasoningModel,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages,
  });
  return completion.choices[0]?.message?.content ?? "";
}

export const groqReasoningProvider: CrmReasoningProvider = {
  async analyze({ snapshot, transcript }): Promise<ReasoningResult> {
    const system = buildSystemPrompt();
    const userContent = JSON.stringify({
      crm_state: snapshot,
      transcript,
    });

    const messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: userContent },
    ];

    let raw = await complete(messages);

    try {
      const parsed = crmAnalysisSchema.parse(JSON.parse(stripFences(raw)));
      return { analysis: parsed, model: groqConfig.reasoningModel, raw };
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
        { role: "assistant" as const, content: raw },
        { role: "user" as const, content: repairPrompt },
      ]);

      const parsed = crmAnalysisSchema.parse(JSON.parse(stripFences(raw)));
      return { analysis: parsed, model: groqConfig.reasoningModel, raw };
    }
  },
};
