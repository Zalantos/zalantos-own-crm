"use client";

import { usePathname } from "next/navigation";
import type { PageContext } from "@/lib/agent/context";

const PATTERNS: [RegExp, PageContext["entityType"]][] = [
  [/^\/companies\/([^/]+)/, "company"],
  [/^\/opportunities\/([^/]+)/, "opportunity"],
  [/^\/people\/([^/]+)/, "person"],
];

// Derives the record the user is viewing from the URL so the agent can
// resolve "esta empresa" / "este deal" to a concrete id.
export function useAgentPageContext(): PageContext | null {
  const pathname = usePathname();
  for (const [pattern, entityType] of PATTERNS) {
    const match = pathname.match(pattern);
    if (match && match[1] !== "new") {
      return { entityType, entityId: match[1] };
    }
  }
  return null;
}
