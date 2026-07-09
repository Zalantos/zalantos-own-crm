import type { EntityContextAnalysis } from "@/lib/entity-context/schema";
import type { MappedChangeItem } from "@/lib/meeting-intelligence/ai/mapping";
import type { ContextEntityType } from "@/lib/entity-context/types";

// Enrichment only maps field updates + contacts. Notes/summary go auto;
// stage/tasks/next_step are intentionally out of scope.
export function mapEnrichmentToItems(
  analysis: EntityContextAnalysis,
  ctx: {
    entityType: ContextEntityType;
    entityId: string;
    companyId: string | null;
  },
): MappedChangeItem[] {
  const items: MappedChangeItem[] = [];

  for (const update of analysis.field_updates) {
    const entityId =
      update.entity_id ??
      (update.entity === ctx.entityType
        ? ctx.entityId
        : update.entity === "company"
          ? ctx.companyId
          : null);

    // Skip stage updates — Meeting Intelligence owns that path.
    if (update.entity === "opportunity" && update.field === "stage") {
      continue;
    }

    items.push({
      type: "update_field",
      entity: update.entity,
      entityId,
      beforeValue: { field: update.field, value: update.current_value ?? null },
      afterValue: { field: update.field, value: update.new_value },
      confidence: update.confidence,
      explanation: update.explanation,
      evidence: update.evidence,
    });
  }

  if (ctx.entityType === "company" || ctx.companyId) {
    for (const contact of analysis.new_contacts) {
      items.push({
        type: "add_contact",
        entity: "person",
        entityId: null,
        beforeValue: null,
        afterValue: {
          firstName: contact.first_name,
          lastName: contact.last_name,
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          roleTitle: contact.role_title ?? null,
          linkedinUrl: contact.linkedin_url ?? null,
          notes: contact.notes ?? null,
          isDecisionMaker: contact.is_decision_maker,
          isSponsor: contact.is_sponsor,
        },
        confidence: contact.confidence,
        explanation: contact.explanation,
        evidence: contact.evidence,
      });
    }
  }

  return items.filter((item) => {
    if (item.type !== "update_field") return true;
    const after = item.afterValue as { field?: string; value?: unknown };
    const before = item.beforeValue as { value?: unknown };
    if (after.value == null || after.value === "") return false;
    return String(after.value) !== String(before.value ?? "");
  });
}

export function buildContextNoteBody(
  analysis: EntityContextAnalysis,
): { title: string; body: string } | null {
  if (analysis.context_note?.body?.trim()) {
    return {
      title: analysis.context_note.title?.trim() || "Contexto IA",
      body: analysis.context_note.body.trim(),
    };
  }

  const facts = analysis.key_facts
    .filter((fact) => fact.label && fact.value)
    .map((fact) => `- ${fact.label}: ${fact.value}`)
    .join("\n");

  const summary = analysis.summary.trim();
  if (!summary && !facts) return null;

  const parts = [
    summary ? summary : null,
    facts ? `Hechos clave:\n${facts}` : null,
  ].filter(Boolean);

  return {
    title: "Contexto IA",
    body: parts.join("\n\n"),
  };
}
