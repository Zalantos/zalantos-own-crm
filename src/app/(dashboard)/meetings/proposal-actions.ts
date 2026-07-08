"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireOrgContext, type TenantClient } from "@/lib/tenant";
import { applyProposal } from "@/lib/meeting-intelligence/apply";
import { appendTimelineEvent } from "@/lib/timeline";
import { ITEM_AFTER_VALUE_SCHEMAS } from "@/lib/zod/proposal-item";

async function getMeetingContext(db: TenantClient, meetingId: string) {
  return db.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: { companyId: true, opportunityId: true, title: true },
  });
}

export async function setItemApproval(
  itemId: string,
  meetingId: string,
  approved: boolean,
) {
  const { user, org, db } = await requireOrgContext();
  const item = await db.cRMChangeItem.update({
    where: { id: itemId },
    data: { approved, status: approved ? "approved" : "pending" },
    select: { type: true, entity: true },
  });

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
  const { count } = await db.cRMChangeItem.updateMany({
    where: { proposalId, status: { notIn: ["applied"] } },
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
  if (["applied", "rejected"].includes(item.proposal.status)) {
    return { error: "La propuesta ya fue cerrada." };
  }

  const schema = ITEM_AFTER_VALUE_SCHEMAS[item.type];
  if (!schema) return { error: "Este tipo de cambio no se puede editar." };
  const parsed = schema.safeParse(afterValue);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Valor inválido. Revisá los campos.",
    };
  }

  // Editing implies accepting the corrected version, so the item is approved.
  await db.cRMChangeItem.update({
    where: { id: itemId },
    data: {
      afterValue: parsed.data as Prisma.InputJsonValue,
      approved: true,
      status: "approved",
    },
  });

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

export async function rejectProposalAction(
  proposalId: string,
  meetingId: string,
) {
  const { user, org, db } = await requireOrgContext();
  await db.cRMChangeProposal.update({
    where: { id: proposalId },
    data: { status: "rejected", reviewedBy: user.id, reviewedAt: new Date() },
  });

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
