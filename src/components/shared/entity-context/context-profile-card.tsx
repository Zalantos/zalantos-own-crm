import { Badge } from "@/components/ui/badge";
import { LinkifiedText } from "@/components/shared/linkified-text";
import type { ContextKeyFact } from "@/lib/entity-context/types";

export type ContextProfileView = {
  summary: string;
  keyFacts: ContextKeyFact[];
  topics: string[];
  lastAnalyzedAt: string;
  model: string | null;
};

function parseKeyFacts(value: unknown): ContextKeyFact[] {
  if (!Array.isArray(value)) return [];
  const facts: ContextKeyFact[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.label !== "string" || typeof record.value !== "string") {
      continue;
    }
    const fact: ContextKeyFact = {
      label: record.label,
      value: record.value,
    };
    if (typeof record.confidence === "number") {
      fact.confidence = record.confidence;
    }
    facts.push(fact);
  }
  return facts;
}

function parseTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function toContextProfileView(profile: {
  summary: string;
  keyFacts: unknown;
  topics: unknown;
  lastAnalyzedAt: Date;
  model: string | null;
}): ContextProfileView {
  return {
    summary: profile.summary,
    keyFacts: parseKeyFacts(profile.keyFacts),
    topics: parseTopics(profile.topics),
    lastAnalyzedAt: profile.lastAnalyzedAt.toISOString(),
    model: profile.model,
  };
}

export function ContextProfileCard({
  profile,
  formatDateTime,
}: {
  profile: ContextProfileView | null;
  formatDateTime: (value: string | Date) => string;
}) {
  if (!profile) {
    return (
      <div className="rounded-md border p-4">
        <p className="text-muted-foreground text-sm">
          Todavía no hay un perfil de contexto. Subí un documento para que la IA
          genere un resumen y hechos clave.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Perfil de contexto</h3>
        <span className="text-muted-foreground text-xs">
          Actualizado {formatDateTime(profile.lastAnalyzedAt)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">
        <LinkifiedText text={profile.summary} />
      </p>
      {profile.keyFacts.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium tracking-wide uppercase">
            Hechos clave
          </h4>
          <ul className="space-y-2">
            {profile.keyFacts.map((fact) => (
              <li
                key={`${fact.label}-${fact.value}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span>
                  <span className="font-medium">{fact.label}: </span>
                  <LinkifiedText text={fact.value} />
                </span>
                {fact.confidence != null && (
                  <Badge variant="outline">
                    {Math.round(fact.confidence * 100)}%
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile.topics.map((topic) => (
            <Badge key={topic} variant="secondary">
              {topic}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
