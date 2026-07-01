import { readFileSync } from "node:fs";
import path from "node:path";

// Prompts live as independent .md files so they can be edited without touching
// code. Read from the source tree at runtime — Railway runs `next start` over
// the full project (no standalone output), so `src/` is present.
const PROMPTS_DIR = path.join(
  process.cwd(),
  "src/lib/meeting-intelligence/prompts",
);

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const content = readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf-8");
  cache.set(name, content);
  return content;
}

// Composes the full system prompt from the modular pieces, in order.
export function buildSystemPrompt(): string {
  return [
    "meeting-analysis",
    "crm-diff",
    "contact-extraction",
    "pain-extraction",
    "proposal-generator",
  ]
    .map(loadPrompt)
    .join("\n\n---\n\n");
}
