// Centralized, lazily-validated access to agent env vars. Reads happen at
// call time so the app boots even when the agent isn't configured yet.

export const agentConfig = {
  // "provider/model". Default: OpenAI gpt-6-luna (Responses API).
  // Overrides may still be groq | anthropic | openai. Groq ids can contain "/",
  // so groq/openai/gpt-oss-120b splits on the first "/" in resolveModel.
  get modelSpec() {
    return process.env.AGENT_MODEL || "openai/gpt-6-luna";
  },
  // Hard stop for the tool-calling loop of a single turn.
  maxSteps: 8,
  // How many prior messages are replayed to the model per turn.
  maxContextMessages: 30,
  // Chars of an attachment injected inline; the rest is paged via read_attachment.
  attachmentInlineCharLimit: 12_000,
  // Máximo de ítems que una propuesta puede tener para confirmarse por chat
  // ("sí"/"aplicala"). Un solo ítem se confirma por texto; con 2 o más se
  // redirige a la web para revisar el diff completo antes de aplicar.
  maxChatConfirmItems: 1,
};
