import type { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { applyProposal } from "@/lib/meeting-intelligence/apply";
import { agentConfig } from "./config";
import type { AgentToolContext } from "./executor";

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
    | "update_task"
    | "update_note"
    | "update_activity"
    | "update_meeting";
  entity:
    "company" | "opportunity" | "person" | "note" | "activity" | "meeting";
  entityId: string | null;
  beforeValue: Prisma.InputJsonValue | null;
  afterValue: Prisma.InputJsonValue;
  explanation: string;
  // Model's self-assessed confidence (0-1); drives attention styling only.
  confidence: number;
  // Verbatim quote from the user's message/document that justifies the change.
  evidence?: string | null;
  // Existing person the dedup matched (set on link_contact items).
  duplicateOfId?: string | null;
  // Human-readable summary line for the inline chat card.
  label: string;
  before: string;
  after: string;
  requiresApproval?: boolean;
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
  status: string;
  undoExpiresAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
};

type AgentMutationResult = {
  status: string;
  changeBatchId: string;
  proposalId: string;
  items: ProposalItemResult[];
  appliedItems: ProposalItemResult[];
  failedItems: ProposalItemResult[];
  pendingItems: ProposalItemResult[];
  errors: { itemId: string; code: string; message: string }[];
  undoExpiresAt: Date | null;
};

function mutationResult(
  status: string,
  proposalId: string,
  items: ProposalItemResult[],
): AgentMutationResult {
  const appliedItems = items.filter((item) => item.status === "applied");
  const failedItems = items.filter((item) => item.status === "failed");
  const pendingItems = items.filter((item) =>
    ["pending", "approved"].includes(item.status),
  );
  const expirations = appliedItems
    .map((item) => item.undoExpiresAt)
    .filter((value): value is Date => value != null)
    .sort((left, right) => left.getTime() - right.getTime());
  return {
    status,
    changeBatchId: proposalId,
    proposalId,
    items,
    appliedItems,
    failedItems,
    pendingItems,
    errors: failedItems.map((item) => ({
      itemId: item.id,
      code: item.failureCode ?? "apply_failed",
      message: item.failureMessage ?? "No se pudo aplicar el cambio",
    })),
    undoExpiresAt: expirations[0] ?? null,
  };
}

export async function readMutationResult(
  db: TenantClient,
  proposalId: string,
): Promise<AgentMutationResult> {
  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    include: { items: { orderBy: [{ sequence: "asc" }, { id: "asc" }] } },
  });
  if (!proposal) throw new Error("No se pudo leer el cambio");
  const items = proposal.items.map((item): ProposalItemResult => ({
    id: item.id,
    label: item.label ?? "",
    before: item.before ?? "",
    after: item.after ?? "",
    explanation: item.explanation,
    evidence: item.evidence ?? null,
    confidence: item.confidence,
    approved: item.approved,
    status: item.status,
    undoExpiresAt: item.undoExpiresAt,
    failureCode: item.failureCode,
    failureMessage: item.failureMessage,
  }));
  return mutationResult(proposal.status, proposal.id, items);
}

type CreateAgentProposalInput = {
  threadId: string;
  // Null only for add_company proposals, which have no existing company to
  // anchor to yet.
  companyId: string | null;
  opportunityId?: string | null;
  items: AgentProposalItemInput[];
  model?: string;
  channel: AgentToolContext["channel"];
  initiatedBy: string;
};

// Los creates anidados no pasan por el auto-scoping: org explícita.
function toItemCreateData(
  organizationId: string,
  item: AgentProposalItemInput,
  sequence: number,
) {
  const requiresApproval = item.requiresApproval ?? false;
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
    requiresApproval,
    sequence,
    // Confidence is now an attention signal, not an execution gate.
    approved: !requiresApproval,
    status: requiresApproval ? "pending" : "approved",
  };
}

// Persists the batch and its items before any CRM write. Safe items start
// approved for immediate execution; destructive items remain pending.
export async function createAgentProposal(
  db: TenantClient,
  organizationId: string,
  {
    threadId,
    companyId,
    opportunityId,
    items,
    model,
    channel,
    initiatedBy,
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
      channel,
      initiatedBy,
      companyId,
      opportunityId: opportunityId ?? null,
      chatThreadId: threadId,
      confidence: proposalConfidence,
      model: model ?? agentConfig.modelSpec,
      items: {
        create: items.map((item, index) =>
          toItemCreateData(organizationId, item, index),
        ),
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
      status: item.status,
      undoExpiresAt: item.undoExpiresAt,
      failureCode: item.failureCode,
      failureMessage: item.failureMessage,
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
  const currentCount = await db.cRMChangeItem.count({ where: { proposalId } });
  const proposal = await db.cRMChangeProposal.update({
    where: { id: proposalId },
    data: {
      status: "pending",
      applyStartedAt: null,
      completedAt: null,
      items: {
        create: items.map((item, index) =>
          toItemCreateData(organizationId, item, currentCount + index),
        ),
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
      status: item.status,
      undoExpiresAt: item.undoExpiresAt,
      failureCode: item.failureCode,
      failureMessage: item.failureMessage,
    })),
  };
}

// Punto único para cualquier mutación del agente. Persiste el lote antes de
// escribir y aplica inmediatamente todos los ítems no destructivos. Una misma
// conversación conserva un lote por turno; llamadas posteriores agregan y
// aplican únicamente los nuevos ítems.
export async function registerProposalChange(
  ctx: AgentToolContext,
  target: { companyId: string | null; opportunityId?: string | null },
  items: AgentProposalItemInput[],
): Promise<AgentMutationResult> {
  const state = ctx.turnState;
  state.changeCount += 1;
  const isFirstChange = state.changeCount === 1;

  const result = state.proposalId
    ? await appendItemsToProposal(
        ctx.db,
        ctx.organizationId,
        state.proposalId,
        items,
      )
    : await createAgentProposal(ctx.db, ctx.organizationId, {
        threadId: ctx.threadId,
        companyId: target.companyId,
        opportunityId: target.opportunityId ?? null,
        items,
        model: ctx.proposalModel,
        channel: ctx.channel,
        initiatedBy: ctx.userId,
      });

  state.proposalId = result.proposalId;

  if (ctx.autoApply === false) {
    return mutationResult(
      isFirstChange ? "proposal_created" : "moved_to_proposal",
      result.proposalId,
      result.items,
    );
  }

  const hasDirectItems = items.some((item) => !item.requiresApproval);
  if (hasDirectItems) {
    await applyProposal(
      ctx.db,
      ctx.organizationId,
      result.proposalId,
      ctx.userId,
    );
  }

  return readMutationResult(ctx.db, result.proposalId);
}
