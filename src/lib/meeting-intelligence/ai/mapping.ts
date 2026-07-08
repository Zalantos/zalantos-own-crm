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
  evidence: string;
  // Set by the dedup pass when an add_contact is turned into link_contact.
  duplicateOfId?: string | null;
};

export type MappingOpportunity = {
  id: string;
  stage: string;
  nextStep: string | null;
  nextStepDueDate: string | null;
};

type MappingContext = {
  companyId: string;
  // Snapshot of the company's opportunities; also used to resolve a target
  // opportunity when the model omits the id, and to fill beforeValue.
  opportunities: MappingOpportunity[];
};

function soleOpportunity(ctx: MappingContext): string | null {
  return ctx.opportunities.length === 1 ? ctx.opportunities[0].id : null;
}

function opportunityById(
  ctx: MappingContext,
  id: string | null,
): MappingOpportunity | null {
  return id ? (ctx.opportunities.find((o) => o.id === id) ?? null) : null;
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

    // Stage sent as a plain field update is normalized into a stage_change
    // item so workflows fire and there is a single apply path for stages.
    if (u.entity === "opportunity" && u.field === "stage") {
      const current = opportunityById(ctx, entityId);
      items.push({
        type: "stage_change",
        entity: "opportunity",
        entityId,
        beforeValue: { value: u.current_value ?? current?.stage ?? null },
        afterValue: { value: u.new_value },
        confidence: u.confidence,
        explanation: u.explanation,
        evidence: u.evidence,
      });
      continue;
    }

    items.push({
      type: "update_field",
      entity: u.entity,
      entityId,
      beforeValue: { field: u.field, value: u.current_value ?? null },
      afterValue: { field: u.field, value: u.new_value },
      confidence: u.confidence,
      explanation: u.explanation,
      evidence: u.evidence,
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
        phone: c.phone ?? null,
        roleTitle: c.role_title ?? null,
        linkedinUrl: c.linkedin_url ?? null,
        notes: c.notes ?? null,
        isDecisionMaker: c.is_decision_maker,
        isSponsor: c.is_sponsor,
      },
      confidence: c.confidence,
      explanation: c.explanation,
      evidence: c.evidence,
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
      evidence: t.evidence,
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
      evidence: n.evidence,
    });
  }

  if (analysis.stage_change) {
    const s = analysis.stage_change;
    const entityId = s.opportunity_id ?? soleOpportunity(ctx);
    const current = opportunityById(ctx, entityId);
    items.push({
      type: "stage_change",
      entity: "opportunity",
      entityId,
      beforeValue: { value: s.from_stage ?? current?.stage ?? null },
      afterValue: { value: s.to_stage },
      confidence: s.confidence,
      explanation: s.explanation,
      evidence: s.evidence,
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
      evidence: p.evidence,
    });
  }

  if (analysis.next_step_update) {
    const n = analysis.next_step_update;
    const entityId = n.opportunity_id ?? soleOpportunity(ctx);
    const current = opportunityById(ctx, entityId);
    items.push({
      type: "update_next_step",
      entity: "opportunity",
      entityId,
      beforeValue: {
        nextStep: current?.nextStep ?? null,
        nextStepDueDate: current?.nextStepDueDate ?? null,
      },
      afterValue: {
        nextStep: n.next_step,
        nextStepDueDate: n.due_date ?? null,
      },
      confidence: n.confidence,
      explanation: n.explanation,
      evidence: n.evidence,
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
