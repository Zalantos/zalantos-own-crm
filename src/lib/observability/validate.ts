import {
  OBSERVABILITY_SERVICE_NAMES,
  OBSERVABILITY_USAGE_KINDS,
  type AiEvent,
} from "@/lib/observability/types";

const SERVICE_NAMES = new Set<string>(OBSERVABILITY_SERVICE_NAMES);
const USAGE_KINDS = new Set<string>(OBSERVABILITY_USAGE_KINDS);

export type AiEventValidationIssue = {
  path: string;
  message: string;
};

// Validación de forma del payload (contrato ingest). No envía nada.
export function validateAiEvent(event: AiEvent): AiEventValidationIssue[] {
  const issues: AiEventValidationIssue[] = [];

  if (!event.execution_id) {
    issues.push({
      path: "execution_id",
      message: "execution_id is required",
    });
  }

  if (event.usage_kind && !USAGE_KINDS.has(event.usage_kind)) {
    issues.push({
      path: "usage_kind",
      message: `invalid usage_kind: ${event.usage_kind}`,
    });
  }

  if (event.service_name && !SERVICE_NAMES.has(event.service_name)) {
    issues.push({
      path: "service_name",
      message: `invalid service_name: ${event.service_name}`,
    });
  }

  if ("input_text" in event) {
    issues.push({
      path: "input_text",
      message: "input_text must not be sent",
    });
  }
  if ("output_text" in event) {
    issues.push({
      path: "output_text",
      message: "output_text must not be sent",
    });
  }

  for (const [index, call] of (event.calls ?? []).entries()) {
    if (!call.model) {
      issues.push({
        path: `calls[${index}].model`,
        message: "model is required",
      });
    }
    const promptTokens = call.promptTokens ?? 0;
    const cachedTokens = call.cachedTokens ?? 0;
    if (promptTokens < cachedTokens) {
      issues.push({
        path: `calls[${index}].promptTokens`,
        message: "promptTokens must be >= cachedTokens",
      });
    }
  }

  return issues;
}
