import type { CrmAnalysis } from "@/lib/meeting-intelligence/ai/schema";
import type { CrmSnapshot } from "@/lib/meeting-intelligence/ai/snapshot";

export type ReasoningResult = {
  analysis: CrmAnalysis;
  model: string;
  // Raw text the model returned, kept for audit on the proposal.
  raw: string;
};

// Swappable reasoning backend. Groq/Llama today; a Claude implementation would
// satisfy the same interface without touching the pipeline.
export type CrmReasoningProvider = {
  analyze(input: {
    snapshot: CrmSnapshot;
    transcript: string;
  }): Promise<ReasoningResult>;
};
