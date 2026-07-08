"use server";

import type { UIMessage } from "ai";
import type { EntityType } from "@prisma/client";
import { requireOrgContext, type TenantClient } from "@/lib/tenant";
import type { PageContext } from "@/lib/agent/context";

// Chat history is personal: every action checks thread ownership.

async function requireOwnedThread(
  db: TenantClient,
  threadId: string,
  userId: string,
) {
  const thread = await db.agentChatThread.findUnique({
    where: { id: threadId },
    select: { id: true, userId: true },
  });
  if (!thread || thread.userId !== userId) {
    throw new Error("Conversación no encontrada");
  }
  return thread;
}

export async function ensureAgentThread(context?: PageContext | null) {
  const { user, org, db } = await requireOrgContext();
  const thread = await db.agentChatThread.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      contextType: (context?.entityType as EntityType | undefined) ?? null,
      contextId: context?.entityId ?? null,
    },
    select: { id: true },
  });
  return { threadId: thread.id };
}

export async function listAgentThreads() {
  const { user, db } = await requireOrgContext();
  return db.agentChatThread.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getAgentThreadMessages(
  threadId: string,
): Promise<UIMessage[]> {
  const { user, db } = await requireOrgContext();
  await requireOwnedThread(db, threadId, user.id);
  const messages = await db.agentChatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
  return messages.map((message) => ({
    id: message.id,
    role: message.role as UIMessage["role"],
    parts: message.parts as unknown as UIMessage["parts"],
  }));
}

export async function deleteAgentThread(threadId: string) {
  const { user, db } = await requireOrgContext();
  await requireOwnedThread(db, threadId, user.id);
  await db.agentChatThread.delete({ where: { id: threadId } });
}
