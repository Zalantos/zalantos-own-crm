import { z } from "zod";

// Solo los campos que el CRM usa, según el contrato de la Wiki
// (src/contracts/search.ts y src/core/get-document.ts de wiki-zalantos). El resto
// se descarta: source_markdown y chunks repiten el texto de full_content.
const wikiSearchResultSchema = z.object({
  document_id: z.string().min(1),
  chunk_id: z.string().min(1),
  title: z.string(),
  heading: z.string().nullable().optional(),
  snippet: z.string(),
  space_id: z.string().optional(),
  tree_path: z.string().nullable().optional(),
  source_uri: z.string(),
  source_modified_at: z.string().nullable().optional(),
});

export const wikiSearchResponseSchema = z.object({
  results: z.array(wikiSearchResultSchema),
  no_evidence: z.boolean(),
});

export const wikiDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  source_uri: z.string(),
  source_type: z.string().optional(),
  client_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  approval_status: z.string().optional(),
  source_modified_at: z.string().nullable().optional(),
  full_content: z.string(),
});

export type WikiSearchResult = z.output<typeof wikiSearchResultSchema>;
export type WikiSearchResponse = z.output<typeof wikiSearchResponseSchema>;
export type WikiDocument = z.output<typeof wikiDocumentSchema>;
