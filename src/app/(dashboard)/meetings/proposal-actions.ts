"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireOrgContext, type TenantClient } from "@/lib/tenant";
import { applyProposal, revertItem } from "@/lib/meeting-intelligence/apply";
import { appendTimelineEvent } from "@/lib/timeline";
import { ITEM_AFTER_VALUE_SCHEMAS } from "@/lib/zod/proposal-item";

async function getMeetingContext(db: TenantClient, meetingId: string) {
  return db.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: { companyId: true, opportunityId: true, title: true },
  });
}

async function requirePendingProposal(db: TenantClient, proposalId: string) {
  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    select: { status: true },
  });
  if (!proposal || proposal.status !== "pending") {
    throw new Error("La propuesta ya no se puede editar");
  }
}

export async function setItemApproval(
  itemId: string,
  meetingId: string,
  approved: boolean,
) {
  const { user, org, db } = await requireOrgContext();
  const item = await db.cRMChangeItem.findUnique({
    where: { id: itemId },
    select: {
      type: true,
      entity: true,
      proposalId: true,
      proposal: { select: { status: true } },
    },
  });
  if (!item || item.proposal.status !== "pending") {
    throw new Error("La propuesta ya no se puede editar");
  }
  const updated = await db.cRMChangeItem.updateMany({
    where: { id: itemId, proposal: { status: "pending" } },
    data: { approved, status: approved ? "approved" : "pending" },
  });
  if (updated.count !== 1)
    throw new Error("La propuesta ya no se puede editar");

  const meeting = await getMeetingContext(db, meetingId);
  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: meeting.companyId,
    opportunityId: meeting.opportunityId,
    type: "proposal_item_reviewed",
    title: `${approved ? "Aprobó" : "Rechazó"} un cambio propuesto`,
    summary: `Reunión: ${meeting.title}`,
    refType: "meeting",
    refId: meetingId,
    actorId: user.id,
    metadata: { itemId, itemType: item.type, entity: item.entity, approved },
  });

  revalidatePath(`/meetings/${meetingId}`);
}

export async function setAllItemsApproval(
  proposalId: string,
  meetingId: string,
  approved: boolean,
) {
  const { user, org, db } = await requireOrgContext();
  await requirePendingProposal(db, proposalId);
  const { count } = await db.cRMChangeItem.updateMany({
    where: {
      proposalId,
      proposal: { status: "pending" },
      status: { notIn: ["applied"] },
    },
    data: { approved, status: approved ? "approved" : "pending" },
  });

  const meeting = await getMeetingContext(db, meetingId);
  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: meeting.companyId,
    opportunityId: meeting.opportunityId,
    type: "proposal_bulk_reviewed",
    title: `${approved ? "Aprobó" : "Rechazó"} todos los cambios pendientes`,
    summary: `${count} cambio(s) ${approved ? "aprobado(s)" : "rechazado(s)"} · Reunión: ${meeting.title}`,
    refType: "meeting",
    refId: meetingId,
    actorId: user.id,
    metadata: { proposalId, count, approved },
  });

  revalidatePath(`/meetings/${meetingId}`);
}

export async function updateItemValue(
  itemId: string,
  meetingId: string,
  afterValue: unknown,
): Promise<{ error?: string }> {
  const { user, org, db } = await requireOrgContext();

  const item = await db.cRMChangeItem.findUnique({
    where: { id: itemId },
    include: { proposal: { select: { status: true } } },
  });
  if (!item) return { error: "El cambio no existe." };
  if (item.status === "applied") return { error: "El cambio ya fue aplicado." };
  if (
    ["applying", "applied", "partially_approved", "rejected"].includes(
      item.proposal.status,
    )
  ) {
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

  // Editing implies accepting the corrected version, so the item is approved.
  const updated = await db.cRMChangeItem.updateMany({
    where: { id: itemId, proposal: { status: "pending" } },
    data: {
      afterValue: parsed.data as Prisma.InputJsonValue,
      approved: true,
      status: "approved",
    },
  });
  if (updated.count !== 1) {
    return { error: "La propuesta ya no se puede editar." };
  }

  const meeting = await getMeetingContext(db, meetingId);
  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: meeting.companyId,
    opportunityId: meeting.opportunityId,
    type: "proposal_item_edited",
    title: "Editó un cambio propuesto",
    summary: `Reunión: ${meeting.title}`,
    refType: "meeting",
    refId: meetingId,
    actorId: user.id,
    metadata: { itemId, itemType: item.type, entity: item.entity },
  });

  revalidatePath(`/meetings/${meetingId}`);
  return {};
}

export async function applyProposalAction(
  proposalId: string,
  meetingId: string,
) {
  const { user, org, db } = await requireOrgContext();
  await applyProposal(db, org.id, proposalId, user.id);
  revalidatePath(`/meetings/${meetingId}`);
}

export async function revertItemAction(
  itemId: string,
  meetingId: string,
): Promise<{ error?: string }> {
  const { user, org, db } = await requireOrgContext();
  try {
    await revertItem(db, org.id, itemId, user.id);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo deshacer.",
    };
  }
  revalidatePath(`/meetings/${meetingId}`);
  return {};
}

export async function rejectProposalAction(
  proposalId: string,
  meetingId: string,
) {
  const { user, org, db } = await requireOrgContext();
  const { count } = await db.cRMChangeProposal.updateMany({
    where: { id: proposalId, status: "pending" },
    data: { status: "rejected", reviewedBy: user.id, reviewedAt: new Date() },
  });
  if (count !== 1) throw new Error("La propuesta ya no se puede rechazar");

  const meeting = await getMeetingContext(db, meetingId);
  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: meeting.companyId,
    opportunityId: meeting.opportunityId,
    type: "proposal_rejected",
    title: `Rechazó la propuesta de cambios`,
    summary: `Reunión: ${meeting.title}`,
    refType: "meeting",
    refId: meetingId,
    actorId: user.id,
    metadata: { proposalId },
  });

  revalidatePath(`/meetings/${meetingId}`);
}
