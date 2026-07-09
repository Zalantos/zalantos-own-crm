"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { applyProposal, revertItem } from "@/lib/meeting-intelligence/apply";
import { appendTimelineEvent } from "@/lib/timeline";
import { ITEM_AFTER_VALUE_SCHEMAS } from "@/lib/zod/proposal-item";
import { resolveContextEntity } from "@/lib/entity-context/resolve-entity";
import {
  isContextEntityType,
  type ContextEntityType,
} from "@/lib/entity-context/types";

async function revalidateEntityPath(
  entityType: ContextEntityType,
  entityId: string,
) {
  const { db } = await requireOrgContext();
  const resolved = await resolveContextEntity(db, entityType, entityId);
  if (resolved) revalidatePath(resolved.revalidatePath);
}

export async function setEnrichmentItemApproval(
  itemId: string,
  entityType: string,
  entityId: string,
  approved: boolean,
) {
  const { user, org, db } = await requireOrgContext();
  if (!isContextEntityType(entityType)) throw new Error("entityType inválido");

  const item = await db.cRMChangeItem.update({
    where: { id: itemId },
    data: { approved, status: approved ? "approved" : "pending" },
    select: {
      type: true,
      entity: true,
      proposal: {
        select: {
          companyId: true,
          opportunityId: true,
          contextSourceId: true,
        },
      },
    },
  });

  if (item.proposal.companyId) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: item.proposal.companyId,
      opportunityId: item.proposal.opportunityId,
      type: "proposal_item_reviewed",
      title: `${approved ? "Aprobó" : "Rechazó"} un cambio de enriquecimiento`,
      refType: "entity_context_source",
      refId: item.proposal.contextSourceId,
      actorId: user.id,
      metadata: { itemId, itemType: item.type, entity: item.entity, approved },
    });
  }

  await revalidateEntityPath(entityType, entityId);
}

export async function setAllEnrichmentItemsApproval(
  proposalId: string,
  entityType: string,
  entityId: string,
  approved: boolean,
) {
  const { user, org, db } = await requireOrgContext();
  if (!isContextEntityType(entityType)) throw new Error("entityType inválido");

  const { count } = await db.cRMChangeItem.updateMany({
    where: { proposalId, status: { notIn: ["applied"] } },
    data: { approved, status: approved ? "approved" : "pending" },
  });

  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    select: {
      companyId: true,
      opportunityId: true,
      contextSourceId: true,
    },
  });

  if (proposal?.companyId) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: proposal.companyId,
      opportunityId: proposal.opportunityId,
      type: "proposal_bulk_reviewed",
      title: `${approved ? "Aprobó" : "Rechazó"} cambios de enriquecimiento`,
      summary: `${count} cambio(s)`,
      refType: "entity_context_source",
      refId: proposal.contextSourceId,
      actorId: user.id,
      metadata: { proposalId, count, approved },
    });
  }

  await revalidateEntityPath(entityType, entityId);
}

export async function updateEnrichmentItemValue(
  itemId: string,
  entityType: string,
  entityId: string,
  afterValue: unknown,
): Promise<{ error?: string }> {
  const { db } = await requireOrgContext();
  if (!isContextEntityType(entityType)) {
    return { error: "entityType inválido" };
  }

  const item = await db.cRMChangeItem.findUnique({
    where: { id: itemId },
    include: { proposal: { select: { status: true } } },
  });
  if (!item) return { error: "El cambio no existe." };
  if (item.status === "applied") return { error: "El cambio ya fue aplicado." };
  if (["applied", "rejected"].includes(item.proposal.status)) {
    return { error: "La propuesta ya fue cerrada." };
  }

  const schema = ITEM_AFTER_VALUE_SCHEMAS[item.type];
  if (!schema) return { error: "Este tipo de cambio no se puede editar." };
  const parsed = schema.safeParse(afterValue);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Valor inválido. Revisá los campos.",
    };
  }

  await db.cRMChangeItem.update({
    where: { id: itemId },
    data: {
      afterValue: parsed.data as Prisma.InputJsonValue,
      approved: true,
      status: "approved",
    },
  });

  await revalidateEntityPath(entityType, entityId);
  return {};
}

export async function applyEnrichmentProposalAction(
  proposalId: string,
  entityType: string,
  entityId: string,
) {
  const { user, org, db } = await requireOrgContext();
  if (!isContextEntityType(entityType)) throw new Error("entityType inválido");
  await applyProposal(db, org.id, proposalId, user.id);
  await revalidateEntityPath(entityType, entityId);
}

export async function rejectEnrichmentProposalAction(
  proposalId: string,
  entityType: string,
  entityId: string,
) {
  const { user, org, db } = await requireOrgContext();
  if (!isContextEntityType(entityType)) throw new Error("entityType inválido");

  const proposal = await db.cRMChangeProposal.update({
    where: { id: proposalId },
    data: { status: "rejected", reviewedBy: user.id, reviewedAt: new Date() },
    select: {
      companyId: true,
      opportunityId: true,
      contextSourceId: true,
    },
  });

  if (proposal.companyId) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: proposal.companyId,
      opportunityId: proposal.opportunityId,
      type: "proposal_rejected",
      title: "Rechazó la propuesta de enriquecimiento",
      refType: "entity_context_source",
      refId: proposal.contextSourceId,
      actorId: user.id,
      metadata: { proposalId },
    });
  }

  await revalidateEntityPath(entityType, entityId);
}

export async function revertEnrichmentItemAction(
  itemId: string,
  entityType: string,
  entityId: string,
): Promise<{ error?: string }> {
  const { user, org, db } = await requireOrgContext();
  if (!isContextEntityType(entityType)) {
    return { error: "entityType inválido" };
  }
  try {
    await revertItem(db, org.id, itemId, user.id);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo deshacer.",
    };
  }
  await revalidateEntityPath(entityType, entityId);
  return {};
}
