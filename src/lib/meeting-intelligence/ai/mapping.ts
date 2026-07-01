import type { CrmAnalysis } from "@/lib/meeting-intelligence/ai/schema";

// Shape written to CRMChangeItem before applying. beforeValue/afterValue are
// Json columns; each change `type` defines its own afterValue payload, and the
// apply step (meetings/apply.ts) switches on `type` to write the CRM.
export type MappedChangeItem = {
  type: string;
  entity: string;
  entityId: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  confidence: number;
  explanation: string;
};

type MappingContext = {
  companyId: string;
  // Used to resolve a target opportunity when the model omits the id.
  opportunityIds: string[];
};

function soleOpportunity(ctx: MappingContext): string | null {
  return ctx.opportunityIds.length === 1 ? ctx.opportunityIds[0] : null;
}

export function mapAnalysisToItems(
  analysis: CrmAnalysis,
  ctx: MappingContext,
): MappedChangeItem[] {
  const items: MappedChangeItem[] = [];

  for (const u of analysis.updates) {
    const entityId =
      u.entity_id ??
      (u.entity === "company"
        ? ctx.companyId
        : u.entity === "opportunity"
          ? soleOpportunity(ctx)
          : null);
    items.push({
      type: "update_field",
      entity: u.entity,
      entityId,
      beforeValue: { field: u.field, value: u.current_value ?? null },
      afterValue: { field: u.field, value: u.new_value },
      confidence: u.confidence,
      explanation: u.explanation,
    });
  }

  for (const c of analysis.new_contacts) {
    items.push({
      type: "add_contact",
      entity: "person",
      entityId: null,
      beforeValue: null,
      afterValue: {
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email ?? null,
        roleTitle: c.role_title ?? null,
        isDecisionMaker: c.is_decision_maker,
        isSponsor: c.is_sponsor,
      },
      confidence: c.confidence,
      explanation: c.explanation,
    });
  }

  const taskItems = [...analysis.tasks, ...analysis.next_steps];
  for (const t of taskItems) {
    items.push({
      type: "create_task",
      entity: "activity",
      entityId: null,
      beforeValue: null,
      afterValue: {
        title: t.title,
        description: t.description,
        dueInDays: t.due_in_days ?? null,
      },
      confidence: t.confidence,
      explanation: t.explanation,
    });
  }

  for (const n of analysis.notes) {
    items.push({
      type: "add_note",
      entity: "note",
      entityId: null,
      beforeValue: null,
      afterValue: { title: n.title ?? null, body: n.body },
      confidence: n.confidence,
      explanation: n.explanation,
    });
  }

  if (analysis.stage_change) {
    const s = analysis.stage_change;
    items.push({
      type: "stage_change",
      entity: "opportunity",
      entityId: s.opportunity_id ?? soleOpportunity(ctx),
      beforeValue: { value: s.from_stage ?? null },
      afterValue: { value: s.to_stage },
      confidence: s.confidence,
      explanation: s.explanation,
    });
  }

  for (const p of analysis.pain_updates) {
    items.push({
      type: "update_pain",
      entity: "opportunity",
      entityId: p.opportunity_id ?? soleOpportunity(ctx),
      beforeValue: null,
      afterValue: { value: p.pain },
      confidence: p.confidence,
      explanation: p.explanation,
    });
  }

  return items;
}

// Non-actionable analysis (kept on Meeting.aiSummary for context + timeline).
export function buildAiSummary(analysis: CrmAnalysis) {
  return {
    headline: analysis.summary.headline,
    keyPoints: analysis.summary.key_points,
    risks: analysis.risks,
    decisions: analysis.decisions,
    confidence: analysis.confidence,
  };
}
