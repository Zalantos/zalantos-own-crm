// Centralized, lazily-validated access to agent env vars. Reads happen at
// call time so the app boots even when the agent isn't configured yet.

export const agentConfig = {
  // "provider/model", e.g. groq/openai/gpt-oss-120b | anthropic/claude-sonnet-4-5 | openai/gpt-4o
  // Note: Groq's gpt-oss ids already contain "/", so the full spec has two
  // slashes (groq/openai/gpt-oss-120b). resolveModel splits on the first "/".
  get modelSpec() {
    return (
      process.env.AGENT_MODEL ||
      `groq/${process.env.GROQ_REASONING_MODEL || "openai/gpt-oss-120b"}`
    );
  },
  // Hard stop for the tool-calling loop of a single turn.
  maxSteps: 8,
  // How many prior messages are replayed to the model per turn.
  maxContextMessages: 30,
  // Chars of an attachment injected inline; the rest is paged via read_attachment.
  attachmentInlineCharLimit: 12_000,
  // Máximo de ítems que una propuesta puede tener para confirmarse por chat
  // (Telegram). Con más cambios se redirige a la web para revisar el diff.
  maxChatConfirmItems: 5,
};
