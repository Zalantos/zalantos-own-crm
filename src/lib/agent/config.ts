// Centralized, lazily-validated access to agent env vars. Reads happen at
// call time so the app boots even when the agent isn't configured yet.

export const agentConfig = {
  // "provider/model", e.g. groq/llama-3.3-70b-versatile | anthropic/claude-sonnet-4-5 | openai/gpt-4o
  get modelSpec() {
    return (
      process.env.AGENT_MODEL ||
      `groq/${process.env.GROQ_REASONING_MODEL || "llama-3.3-70b-versatile"}`
    );
  },
  // Hard stop for the tool-calling loop of a single turn.
  maxSteps: 8,
  // How many prior messages are replayed to the model per turn.
  maxContextMessages: 30,
  // Chars of an attachment injected inline; the rest is paged via read_attachment.
  attachmentInlineCharLimit: 12_000,
};
