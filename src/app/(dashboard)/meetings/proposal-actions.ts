"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { applyProposal } from "@/lib/meeting-intelligence/apply";
import { appendTimelineEvent } from "@/lib/timeline";

async function getMeetingContext(meetingId: string) {
  return prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: { companyId: true, opportunityId: true, title: true },
  });
}

export async function setItemApproval(
  itemId: string,
  meetingId: string,
  approved: boolean,
) {
  const user = await requireUser();
  const item = await prisma.cRMChangeItem.update({
    where: { id: itemId },
    data: { approved, status: approved ? "approved" : "pending" },
    select: { type: true, entity: true },
  });

  const meeting = await getMeetingContext(meetingId);
  await appendTimelineEvent(prisma, {
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
  const user = await requireUser();
  const { count } = await prisma.cRMChangeItem.updateMany({
    where: { proposalId, status: { notIn: ["applied"] } },
    data: { approved, status: approved ? "approved" : "pending" },
  });

  const meeting = await getMeetingContext(meetingId);
  await appendTimelineEvent(prisma, {
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

export async function applyProposalAction(
  proposalId: string,
  meetingId: string,
) {
  const user = await requireUser();
  await applyProposal(proposalId, user.id);
  revalidatePath(`/meetings/${meetingId}`);
}

export async function rejectProposalAction(
  proposalId: string,
  meetingId: string,
) {
  const user = await requireUser();
  await prisma.cRMChangeProposal.update({
    where: { id: proposalId },
    data: { status: "rejected", reviewedBy: user.id, reviewedAt: new Date() },
  });

  const meeting = await getMeetingContext(meetingId);
  await appendTimelineEvent(prisma, {
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
