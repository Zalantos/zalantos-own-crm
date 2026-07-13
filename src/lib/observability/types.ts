export type AiCall = {
  provider?: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
};

export type ObservabilityServiceName =
  | "n8n"
  | "backend"
  | "worker-emails"
  | "bot-whatsapp"
  | "other";

export type ObservabilityUsageKind =
  | "agent_run"
  | "chat_completion"
  | "extraction"
  | "classification"
  | "summarization"
  | "transcription"
  | "embedding"
  | "rerank"
  | "guardrail"
  | "other";

export type AiEvent = {
  execution_id: string;
  started_at?: string;
  duration_ms?: number;
  status?: "success" | "error";
  error_message?: string;
  workflow_id?: string;
  workflow_name?: string;
  agent_name?: string;
  source_type?: string;
  service_name?: ObservabilityServiceName;
  service_slug?: string;
  flow_slug?: string;
  usage_kind?: ObservabilityUsageKind;
  actor?: Record<string, unknown>;
  phase_timings?: Record<string, number>;
  quality?: Record<string, unknown>;
  calls?: AiCall[];
  metadata?: Record<string, unknown>;
};

export const OBSERVABILITY_SERVICE_NAMES = [
  "n8n",
  "backend",
  "worker-emails",
  "bot-whatsapp",
  "other",
] as const satisfies readonly ObservabilityServiceName[];

export const OBSERVABILITY_USAGE_KINDS = [
  "agent_run",
  "chat_completion",
  "extraction",
  "classification",
  "summarization",
  "transcription",
  "embedding",
  "rerank",
  "guardrail",
  "other",
] as const satisfies readonly ObservabilityUsageKind[];

// Catálogo central: este CRM es backend Next.js.
export const CRM_OBSERVABILITY_SERVICE_NAME =
  "backend" as const satisfies ObservabilityServiceName;
export const CRM_OBSERVABILITY_SERVICE_SLUG = "crm-zalantos";
