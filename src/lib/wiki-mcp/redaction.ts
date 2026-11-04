const WIKI_TOOL_PARTS = new Set([
  "tool-wiki_search_knowledge",
  "tool-wiki_read_document",
]);

type CitationFields = { documentId?: unknown; title?: unknown; url?: unknown };

function citationOf(value: CitationFields) {
  return { documentId: value.documentId, title: value.title, url: value.url };
}

function redactOutput(output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const { results, ...rest } = output as {
    results?: CitationFields[];
    text?: unknown;
  } & CitationFields;
  if ("error" in rest) return rest;
  return {
    content_redacted: true,
    ...(Array.isArray(results)
      ? { results: results.map(citationOf) }
      : citationOf(rest)),
  };
}

// El historial del chat guarda los parts de cada turno. Sin esto, el texto de la
// Wiki quedaría copiado en agent_chat_messages: el CRM conserva solo la cita y el
// agente vuelve a leer el documento en su origen si lo necesita.
export function redactWikiToolParts<Part extends { type: string }>(
  parts: Part[],
): Part[] {
  return parts.map((part) => {
    if (!WIKI_TOOL_PARTS.has(part.type) || !("output" in part)) return part;
    return { ...part, output: redactOutput(part.output) };
  });
}
