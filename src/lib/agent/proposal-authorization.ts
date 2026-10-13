import type { TenantClient } from "@/lib/tenant";

type ApprovalUser = { id: string; role: string };

export async function requireCanApproveProposal(
  db: TenantClient,
  proposalId: string,
  user: ApprovalUser,
) {
  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      source: true,
      status: true,
      chatThreadId: true,
      contextSourceId: true,
      initiatedBy: true,
      meeting: { select: { createdBy: true } },
    },
  });
  if (!proposal) throw new Error("Cambio no encontrado");
  if (user.role === "ADMIN" || proposal.initiatedBy === user.id) {
    return proposal;
  }
  if (proposal.meeting?.createdBy === user.id) return proposal;
  if (proposal.chatThreadId) {
    const thread = await db.agentChatThread.findUnique({
      where: { id: proposal.chatThreadId },
      select: { userId: true },
    });
    if (thread?.userId === user.id) return proposal;
  }
  if (proposal.contextSourceId) {
    const source = await db.entityContextSource.findUnique({
      where: { id: proposal.contextSourceId },
      select: { uploadedBy: true },
    });
    if (source?.uploadedBy === user.id) return proposal;
  }
  throw new Error(
    "Solo el solicitante o un administrador puede aprobar este cambio",
  );
}
