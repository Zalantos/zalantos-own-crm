import { prismaSystem } from "@/lib/prisma";

// n8n manda chat.id como número en el JSON; lo normalizamos a string (el modelo
// guarda telegramChatId como TEXT). Devuelve null si viene vacío/no numérico.
export function normalizeChatId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export type ActiveTelegramLink = {
  id: string;
  organizationId: string;
  userId: string;
  agentThreadId: string | null;
};

// Resuelve el vínculo activo por chat de Telegram usando prismaSystem (owner,
// exento de RLS) porque todavía no conocemos la organización. Devuelve null si
// el chat no está vinculado o el vínculo está inactivo.
export async function resolveActiveTelegramLink(
  chatId: string,
): Promise<ActiveTelegramLink | null> {
  const link = await prismaSystem.telegramLink.findUnique({
    where: { telegramChatId: chatId },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      agentThreadId: true,
      isActive: true,
    },
  });
  if (!link || !link.isActive) return null;
  return {
    id: link.id,
    organizationId: link.organizationId,
    userId: link.userId,
    agentThreadId: link.agentThreadId,
  };
}
