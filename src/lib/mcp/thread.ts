import type { TenantClient } from "@/lib/tenant";
import type { McpPrincipal } from "./auth";

export async function ensureMcpThread(
  db: TenantClient,
  principal: McpPrincipal,
): Promise<string> {
  if (principal.agentThreadId) {
    const existing = await db.agentChatThread.findFirst({
      where: { id: principal.agentThreadId, userId: principal.userId },
      select: { id: true },
    });
    if (existing) return existing.id;
    throw new Error("No se pudo resolver el hilo MCP");
  }

  const thread = await db.agentChatThread.create({
    data: {
      organizationId: principal.organizationId,
      userId: principal.userId,
      title: "MCP",
      contextType: null,
      contextId: null,
    },
    select: { id: true },
  });

  const claimed = await db.mcpAccessToken.updateMany({
    where: {
      id: principal.tokenId,
      userId: principal.userId,
      agentThreadId: null,
      revokedAt: null,
    },
    data: { agentThreadId: thread.id },
  });
  if (claimed.count === 1) return thread.id;

  const current = await db.mcpAccessToken.findFirst({
    where: { id: principal.tokenId, userId: principal.userId, revokedAt: null },
    select: { agentThreadId: true },
  });
  await db.agentChatThread.delete({ where: { id: thread.id } });
  if (!current?.agentThreadId) {
    throw new Error("No se pudo crear el hilo MCP");
  }
  return current.agentThreadId;
}
