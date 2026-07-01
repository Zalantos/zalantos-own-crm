"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { applyProposal } from "@/lib/meeting-intelligence/apply";

export async function setItemApproval(
  itemId: string,
  meetingId: string,
  approved: boolean,
) {
  await requireUser();
  await prisma.cRMChangeItem.update({
    where: { id: itemId },
    data: { approved, status: approved ? "approved" : "pending" },
  });
  revalidatePath(`/meetings/${meetingId}`);
}

export async function setAllItemsApproval(
  proposalId: string,
  meetingId: string,
  approved: boolean,
) {
  await requireUser();
  await prisma.cRMChangeItem.updateMany({
    where: { proposalId, status: { notIn: ["applied"] } },
    data: { approved, status: approved ? "approved" : "pending" },
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
  revalidatePath(`/meetings/${meetingId}`);
}
