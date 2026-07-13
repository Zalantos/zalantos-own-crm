import { generateText, type LanguageModelUsage, type ModelMessage } from "ai";
import { groqConfig } from "@/lib/meeting-intelligence/config";
import { buildSystemPrompt } from "@/lib/meeting-intelligence/prompts/loader";
import { crmAnalysisSchema } from "@/lib/meeting-intelligence/ai/schema";
import { resolveModel } from "@/lib/agent/model";
import type {
  CrmReasoningProvider,
  ReasoningResult,
} from "@/lib/meeting-intelligence/ai/provider";
import {
  CRM_OBSERVABILITY_SERVICE_NAME,
  CRM_OBSERVABILITY_SERVICE_SLUG,
  aiCallFromModelSpec,
  reportAiEventBestEffort,
  type AiCall,
} from "@/lib/observability";
import { randomUUID } from "node:crypto";

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

async function complete(
  instructions: string,
  messages: ModelMessage[],
): Promise<{ text: string; usage: LanguageModelUsage }> {
  const { text, usage } = await generateText({
    model: resolveModel(meetingModelSpec()),
    temperature: 0.1,
    instructions,
    messages,
  });
  return { text, usage };
}

function pushCall(
  calls: AiCall[],
  usage: LanguageModelUsage | undefined,
): void {
  calls.push(aiCallFromModelSpec(meetingModelSpec(), usage));
}

// AI SDK-based reasoning provider (any provider/model via env). Keeps the
// Zod-validation + repair-retry loop because weaker models occasionally break
// the JSON contract even with a strict prompt.
export const defaultReasoningProvider: CrmReasoningProvider = {
  async analyze({ snapshot, transcript }): Promise<ReasoningResult> {
    const executionId = `meeting-reasoning:${randomUUID()}`;
    const startedAt = new Date();
    const calls: AiCall[] = [];

    const system = buildSystemPrompt();
    const userContent = JSON.stringify({
      crm_state: snapshot,
      transcript,
    });

    const messages: ModelMessage[] = [{ role: "user", content: userContent }];

    try {
      let completion = await complete(system, messages);
      pushCall(calls, completion.usage);
      let raw = completion.text;

      try {
        const parsed = crmAnalysisSchema.parse(JSON.parse(stripFences(raw)));
        reportAiEventBestEffort({
          execution_id: executionId,
          started_at: startedAt.toISOString(),
          duration_ms: Date.now() - startedAt.getTime(),
          status: "success",
          workflow_name: "meeting-intelligence-reasoning",
          source_type: "backend",
          service_name: CRM_OBSERVABILITY_SERVICE_NAME,
          service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
          flow_slug: "meeting-reasoning",
          usage_kind: "extraction",
          calls,
        });
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

        completion = await complete(system, [
          ...messages,
          { role: "assistant", content: raw },
          { role: "user", content: repairPrompt },
        ]);
        pushCall(calls, completion.usage);
        raw = completion.text;

        const parsed = crmAnalysisSchema.parse(JSON.parse(stripFences(raw)));
        reportAiEventBestEffort({
          execution_id: executionId,
          started_at: startedAt.toISOString(),
          duration_ms: Date.now() - startedAt.getTime(),
          status: "success",
          workflow_name: "meeting-intelligence-reasoning",
          source_type: "backend",
          service_name: CRM_OBSERVABILITY_SERVICE_NAME,
          service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
          flow_slug: "meeting-reasoning",
          usage_kind: "extraction",
          calls,
        });
        return { analysis: parsed, model: meetingModelSpec(), raw };
      }
    } catch (error) {
      reportAiEventBestEffort({
        execution_id: executionId,
        started_at: startedAt.toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        status: "error",
        error_message:
          error instanceof Error ? error.message : String(error),
        workflow_name: "meeting-intelligence-reasoning",
        source_type: "backend",
        service_name: CRM_OBSERVABILITY_SERVICE_NAME,
        service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
        flow_slug: "meeting-reasoning",
        usage_kind: "extraction",
        calls,
      });
      throw error;
    }
  },
};
