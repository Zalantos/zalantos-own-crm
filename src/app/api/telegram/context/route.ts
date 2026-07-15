import { NextResponse, type NextRequest } from "next/server";
import { prismaSystem } from "@/lib/prisma";
import { authorizeTelegramRequest } from "@/lib/telegram/auth";
import { normalizeChatId, resolveActiveTelegramLink } from "@/lib/telegram/link";

// POST /api/telegram/context — gate barato que n8n llama ANTES de transcribir voz
// o invocar al modelo. Evita gastar en STT/IA si el chat no está vinculado.
// Shape que ya lee el nodo IF de n8n (notEmpty sobre body):
//   no vinculado → {}   |   vinculado → { user_id, org_id, full_name }

type ContextBody = { chat_id?: unknown };

export async function POST(request: NextRequest) {
  const auth = authorizeTelegramRequest(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ContextBody;
  try {
    body = (await request.json()) as ContextBody;
  } catch {
    return NextResponse.json({});
  }

  const chatId = normalizeChatId(body.chat_id);
  if (!chatId) {
    return NextResponse.json({});
  }

  const link = await resolveActiveTelegramLink(chatId);
  if (!link) {
    return NextResponse.json({});
  }

  const user = await prismaSystem.user.findUnique({
    where: { id: link.userId },
    select: { name: true, email: true },
  });

  return NextResponse.json({
    user_id: link.userId,
    org_id: link.organizationId,
    full_name: user?.name ?? user?.email ?? "",
  });
}
