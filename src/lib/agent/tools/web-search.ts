import { defineAgentTool } from "@/lib/agent/tool-definition";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/agent/executor";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 10_000;

type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
};

type TavilySearchResponse = {
  results?: TavilySearchResult[];
};

export function buildWebSearchTools(_ctx: AgentToolContext) {
  return {
    web_search: defineAgentTool({
      description:
        "Busca en la web con Tavily. Usala SOLO cuando el dato pedido pueda haber cambiado (versiones, precios, noticias, documentación externa) o el usuario pida fuentes/enlaces, y no para preguntas sobre datos del CRM (usá las tools de lectura del CRM para eso).",
      inputSchema: z.object({
        query: z.string().min(1).describe("Consulta de búsqueda"),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Cantidad máxima de resultados (default 5)"),
      }),
      execute: async ({ query, maxResults }) => {
        const apiKey = process.env.TAVILY_API_KEY?.trim();
        if (!apiKey) {
          return { error: "TAVILY_API_KEY no está configurada." };
        }

        const response = await fetch(TAVILY_SEARCH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            max_results: maxResults ?? 5,
          }),
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        if (!response.ok) {
          return { error: `Tavily respondió ${response.status}: ${await response.text()}` };
        }

        const data = (await response.json()) as TavilySearchResponse;
        return {
          results: (data.results ?? []).map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content,
          })),
        };
      },
    }),
  };
}
