"use server";

import type { UIMessage } from "ai";
import type { EntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import type { PageContext } from "@/lib/agent/context";

// Chat history is personal: every action checks thread ownership.

async function requireOwnedThread(threadId: string, userId: string) {
  const thread = await prisma.agentChatThread.findUnique({
    where: { id: threadId },
    select: { id: true, userId: true },
  });
  if (!thread || thread.userId !== userId) {
    throw new Error("Conversación no encontrada");
  }
  return thread;
}

export async function ensureAgentThread(context?: PageContext | null) {
  const user = await requireUser();
  const thread = await prisma.agentChatThread.create({
    data: {
      userId: user.id,
      contextType: (context?.entityType as EntityType | undefined) ?? null,
      contextId: context?.entityId ?? null,
    },
    select: { id: true },
  });
  return { threadId: thread.id };
}

export async function listAgentThreads() {
  const user = await requireUser();
  return prisma.agentChatThread.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getAgentThreadMessages(
  threadId: string,
): Promise<UIMessage[]> {
  const user = await requireUser();
  await requireOwnedThread(threadId, user.id);
  const messages = await prisma.agentChatMessage.findMany({
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
  const user = await requireUser();
  await requireOwnedThread(threadId, user.id);
  await prisma.agentChatThread.delete({ where: { id: threadId } });
}
