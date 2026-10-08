import type { Prisma } from "@prisma/client";
import { withOrgTransaction, type TenantClient } from "@/lib/tenant";
import { approvalFromConfidence } from "@/lib/crm/proposal-policy";
import { agentConfig } from "./config";
import type { AgentToolContext, PendingInstantChange } from "./executor";

export type AgentProposalItemInput = {
  type:
    | "update_field"
    | "stage_change"
    | "add_contact"
    | "link_contact"
    | "add_opportunity"
    | "add_company"
    | "add_note"
    | "create_task"
    | "log_activity"
    | "create_meeting"
    | "update_task";
  entity:
    "company" | "opportunity" | "person" | "note" | "activity" | "meeting";
  entityId: string | null;
  beforeValue: Prisma.InputJsonValue | null;
  afterValue: Prisma.InputJsonValue;
  explanation: string;
  // Model's self-assessed confidence (0-1); drives auto-approval and the card.
  confidence: number;
  // Verbatim quote from the user's message/document that justifies the change.
  evidence?: string | null;
  // Existing person the dedup matched (set on link_contact items).
  duplicateOfId?: string | null;
  // Human-readable summary line for the inline chat card.
  label: string;
  before: string;
  after: string;
};

type ProposalItemResult = {
  id: string;
  label: string;
  before: string;
  after: string;
  explanation: string;
  evidence: string | null;
  confidence: number;
  approved: boolean;
};

type CreateAgentProposalInput = {
  threadId: string;
  // Null only for add_company proposals, which have no existing company to
  // anchor to yet.
  companyId: string | null;
  opportunityId?: string | null;
  items: AgentProposalItemInput[];
  model?: string;
};

// Los creates anidados no pasan por el auto-scoping: org explícita.
function toItemCreateData(
  organizationId: string,
  item: AgentProposalItemInput,
) {
  return {
    organizationId,
    type: item.type,
    entity: item.entity,
    entityId: item.entityId,
    beforeValue: item.beforeValue ?? undefined,
    afterValue: item.afterValue,
    confidence: item.confidence,
    explanation: item.explanation,
    evidence: item.evidence || null,
    duplicateOfId: item.duplicateOfId ?? null,
    // Cadenas legibles para renderizar el card desde la DB (ver schema).
    label: item.label,
    before: item.before,
    after: item.after,
    // Pre-approve only high-confidence items; the rest need a tick.
    ...approvalFromConfidence(item.confidence),
  };
}

// The only write path available to "proposal"-classified agent tools: it
// persists a reviewable CRMChangeProposal. Items start approved so the user
// only unticks what they disagree with before applying.
export async function createAgentProposal(
  db: TenantClient,
  organizationId: string,
  {
    threadId,
    companyId,
    opportunityId,
    items,
    model,
  }: CreateAgentProposalInput,
) {
  // Proposal-level confidence = the least confident item (the weakest link).
  const proposalConfidence = items.length
    ? Math.min(...items.map((item) => item.confidence))
    : 1;

  const proposal = await db.cRMChangeProposal.create({
    data: {
      organizationId,
      source: "agent",
      companyId,
      opportunityId: opportunityId ?? null,
      chatThreadId: threadId,
      confidence: proposalConfidence,
      model: model ?? agentConfig.modelSpec,
      items: {
        create: items.map((item) => toItemCreateData(organizationId, item)),
      },
    },
    include: { items: true },
  });

  return {
    status: "proposal_created" as const,
    proposalId: proposal.id,
    items: proposal.items.map((item): ProposalItemResult => ({
      id: item.id,
      label: item.label ?? "",
      before: item.before ?? "",
      after: item.after ?? "",
      explanation: item.explanation,
      evidence: item.evidence ?? null,
      confidence: item.confidence,
      approved: item.approved,
    })),
  };
}

// Suma ítems a una propuesta que ya existe (el turno ya generó un cambio
// antes). Devuelve TODOS los ítems de la propuesta, no solo los nuevos, para
// que la tarjeta del chat se pueda renderizar completa de una sola vez.
export async function appendItemsToProposal(
  db: TenantClient,
  organizationId: string,
  proposalId: string,
  items: AgentProposalItemInput[],
) {
  const proposal = await db.cRMChangeProposal.update({
    where: { id: proposalId },
    data: {
      items: {
        create: items.map((item) => toItemCreateData(organizationId, item)),
      },
    },
    include: { items: true },
  });

  return {
    status: "moved_to_proposal" as const,
    proposalId: proposal.id,
    items: proposal.items.map((item): ProposalItemResult => ({
      id: item.id,
      label: item.label ?? "",
      before: item.before ?? "",
      after: item.after ?? "",
      explanation: item.explanation,
      evidence: item.evidence ?? null,
      confidence: item.confidence,
      approved: item.approved,
    })),
  };
}

async function revertPendingInstant(
  ctx: AgentToolContext,
  pending: PendingInstantChange,
) {
  await withOrgTransaction(ctx.organizationId, async (tx) => {
    if (pending.undo) {
      await pending.undo(tx);
    } else if (pending.kind === "note") {
      await tx.note.delete({
        where: { id: pending.entityId, organizationId: ctx.organizationId },
      });
    } else {
      await tx.activity.delete({
        where: { id: pending.entityId, organizationId: ctx.organizationId },
      });
    }
  });
}

// Punto único por el que pasa cualquier cambio del turno que no pueda (o ya
// no pueda) aplicarse al instante: field/stage/contact/opportunity/company
// (siempre) y note/task (a partir del segundo cambio del turno). Todo cae en
// UNA sola CRMChangeProposal por turno — crea la primera vez, agrega después.
// `items` acepta más de uno porque update_record_fields puede proponer varios
// campos en un mismo llamado; para el resto de las tools es un array de 1.
export async function registerProposalChange(
  ctx: AgentToolContext,
  target: { companyId: string | null; opportunityId?: string | null },
  items: AgentProposalItemInput[],
): Promise<{
  status: "proposal_created" | "moved_to_proposal";
  proposalId: string;
  items: ProposalItemResult[];
}> {
  const state = ctx.turnState;
  state.changeCount += 1;
  const isFirstChange = state.changeCount === 1;

  const pending = state.pendingInstant;
  const itemsToAdd = pending ? [pending.item, ...items] : items;

  const result = state.proposalId
    ? await appendItemsToProposal(
        ctx.db,
        ctx.organizationId,
        state.proposalId,
        itemsToAdd,
      )
    : await createAgentProposal(ctx.db, ctx.organizationId, {
        threadId: ctx.threadId,
        companyId: target.companyId,
        opportunityId: target.opportunityId ?? null,
        items: itemsToAdd,
        model: ctx.proposalModel,
      });

  state.proposalId = result.proposalId;

  // Recién ahora, con el ítem ya persistido en la propuesta, borrar la fila
  // que se había escrito al instante (si falla la creación de arriba, la
  // fila original queda intacta en vez de perderse).
  if (pending) {
    await revertPendingInstant(ctx, pending);
    state.pendingInstant = null;
  }

  return {
    status: isFirstChange ? "proposal_created" : "moved_to_proposal",
    proposalId: result.proposalId,
    items: result.items,
  };
}
