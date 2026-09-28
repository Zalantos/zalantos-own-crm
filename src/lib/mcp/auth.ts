import { prismaSystem } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";

export type McpPrincipal = {
  userId: string;
  organizationId: string;
  tokenId: string;
  agentThreadId: string | null;
};

export async function authenticateMcpBearer(
  authorization: string | null,
): Promise<McpPrincipal | null> {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;

  const token = await prismaSystem.mcpAccessToken.findUnique({
    where: { tokenHash: hashToken(match[1]) },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      agentThreadId: true,
      revokedAt: true,
      organization: { select: { isActive: true } },
    },
  });
  if (!token || token.revokedAt || !token.organization.isActive) return null;

  const user = await prismaSystem.user.findUnique({
    where: { id: token.userId },
    select: { id: true, isActive: true, organizationId: true },
  });
  if (
    !user?.isActive ||
    !user.organizationId ||
    user.organizationId !== token.organizationId
  ) {
    return null;
  }

  try {
    await prismaSystem.mcpAccessToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    // El uso sigue autorizado aunque falle esta marca de auditoría best-effort.
  }

  return {
    userId: user.id,
    organizationId: token.organizationId,
    tokenId: token.id,
    agentThreadId: token.agentThreadId,
  };
}
