import type { z } from "zod";

export type AgentToolDefinition<Schema extends z.ZodType, Output> = {
  description: string;
  inputSchema: Schema;
  execute: (input: z.output<Schema>) => Output | Promise<Output>;
};

// Mantiene schemas y ejecución independientes del transporte. El AI SDK y
// MCP adaptan estas mismas definiciones sin duplicar lógica de negocio.
export function defineAgentTool<Schema extends z.ZodType, Output>(
  definition: AgentToolDefinition<Schema, Output>,
): AgentToolDefinition<Schema, Output> {
  return definition;
}
