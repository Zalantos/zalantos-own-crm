import { NextResponse, type NextRequest } from "next/server";
import { prismaSystem } from "@/lib/prisma";
import { authorizeTelegramRequest } from "@/lib/telegram/auth";
import { normalizeChatId } from "@/lib/telegram/link";

// POST /api/telegram/link — handshake de vinculación disparado por n8n cuando el
// usuario manda "/vincular <código>". Devuelve el shape que ya leen los nodos de
// n8n (Switch): { success: true, full_name } | { success: false, error }.
// Todos los resultados de negocio responden 200; solo fallos reales de server → 500
// (que caen al branch "Error" del Switch, que chequea que exista statusCode).

type LinkBody = {
  code?: unknown;
  chat_id?: unknown;
  username?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = authorizeTelegramRequest(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: LinkBody;
  try {
    body = (await request.json()) as LinkBody;
  } catch {
    return NextResponse.json({ success: false, error: "invalid_code" });
  }

  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const chatId = normalizeChatId(body.chat_id);
  const username =
    typeof body.username === "string" && body.username.trim().length > 0
      ? body.username.trim().replace(/^@/, "")
      : null;

  if (!code || !chatId) {
    return NextResponse.json({ success: false, error: "invalid_code" });
  }

  try {
    const linkCode = await prismaSystem.telegramLinkCode.findUnique({
      where: { code },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        used: true,
        expiresAt: true,
      },
    });

    if (!linkCode || linkCode.used || linkCode.expiresAt <= new Date()) {
      return NextResponse.json({ success: false, error: "invalid_code" });
    }

    const existing = await prismaSystem.telegramLink.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true, isActive: true },
    });
    if (existing?.isActive) {
      return NextResponse.json({ success: false, error: "already_linked" });
    }

    const user = await prismaSystem.user.findUnique({
      where: { id: linkCode.userId },
      select: { name: true, email: true, isActive: true },
    });
    if (!user?.isActive) {
      // El usuario dueño del código fue desactivado entre la generación y el uso.
      return NextResponse.json({ success: false, error: "invalid_code" });
    }

    await prismaSystem.$transaction(async (tx) => {
      // Reactiva un vínculo previo inactivo para el mismo chat, o crea uno nuevo.
      if (existing) {
        await tx.telegramLink.update({
          where: { id: existing.id },
          data: {
            organizationId: linkCode.organizationId,
            userId: linkCode.userId,
            telegramUsername: username,
            isActive: true,
            agentThreadId: null,
          },
        });
      } else {
        await tx.telegramLink.create({
          data: {
            organizationId: linkCode.organizationId,
            userId: linkCode.userId,
            telegramChatId: chatId,
            telegramUsername: username,
          },
        });
      }
      await tx.telegramLinkCode.update({
        where: { id: linkCode.id },
        data: { used: true },
      });
    });

    return NextResponse.json({
      success: true,
      full_name: user.name ?? user.email,
    });
  } catch (error) {
    console.error("[telegram/link] error", error);
    return NextResponse.json(
      { success: false, error: "server_error" },
      { status: 500 },
    );
  }
}
