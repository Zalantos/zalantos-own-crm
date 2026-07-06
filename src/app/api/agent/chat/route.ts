import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { agentConfig } from "@/lib/agent/config";
import { resolveAgentModel } from "@/lib/agent/model";
import { resolvePageContext, type PageContext } from "@/lib/agent/context";
import { buildAgentSystemPrompt } from "@/lib/agent/system-prompt";
import { buildAgentTools } from "@/lib/agent/executor";
import type { Prisma } from "@prisma/client";

// Multi-step tool loops (search → read → act) can take a while on slow models.
export const maxDuration = 120;

type ChatRequestBody = {
  messages: UIMessage[];
  threadId?: string;
  context?: PageContext | null;
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const userId = user.id;

  const { messages, threadId, context }: ChatRequestBody = await req.json();
  if (!threadId) {
    return Response.json({ error: "Falta threadId" }, { status: 400 });
  }

  const thread = await prisma.agentChatThread.findUnique({
    where: { id: threadId },
    select: { id: true, userId: true, title: true },
  });
  if (!thread || thread.userId !== userId) {
    return Response.json({ error: "Thread no encontrado" }, { status: 404 });
  }

  // Persist the incoming user message and touch the thread (title on first message).
  const userMessage = messages.at(-1);
  if (userMessage?.role === "user") {
    const text = userMessage.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim();
    await prisma.$transaction([
      prisma.agentChatMessage.upsert({
        where: { id: userMessage.id },
        create: {
          id: userMessage.id,
          threadId,
          role: "user",
          parts: userMessage.parts as unknown as Prisma.InputJsonValue,
        },
        update: {
          parts: userMessage.parts as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.agentChatThread.update({
        where: { id: threadId },
        data: thread.title ? {} : { title: text.slice(0, 120) || null },
      }),
    ]);
  }

  const pageContext = context ? await resolvePageContext(context) : null;

  // The latest attachments of the thread ride along every turn (excerpt only);
  // the model pages through longer documents with read_attachment.
  const attachments = await prisma.agentAttachment.findMany({
    where: { threadId, status: "extracted" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, filename: true, extractedText: true },
  });
  const promptAttachments = attachments.reverse().map((attachment) => {
    const text = attachment.extractedText ?? "";
    return {
      id: attachment.id,
      filename: attachment.filename,
      excerpt: text.slice(0, agentConfig.attachmentInlineCharLimit),
      truncated: text.length > agentConfig.attachmentInlineCharLimit,
    };
  });

  const recentMessages = messages.slice(-agentConfig.maxContextMessages);

  const result = streamText({
    model: resolveAgentModel(),
    system: buildAgentSystemPrompt({
      pageContext,
      attachments: promptAttachments,
    }),
    messages: await convertToModelMessages(recentMessages),
    tools: buildAgentTools({ userId, threadId, pageContext }),
    stopWhen: stepCountIs(agentConfig.maxSteps),
  });

  // Drive the stream to completion server-side so the assistant reply is
  // persisted even if the client disconnects (e.g. the user closes the panel
  // mid-response). Without this, onFinish never fires on disconnect and the
  // thread ends up with an orphaned user message and no reply, which looks
  // like a scrambled/out-of-order conversation on reopen.
  void result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onFinish: async ({ responseMessage }) => {
        try {
          await prisma.agentChatMessage.upsert({
            where: { id: responseMessage.id },
            create: {
              id: responseMessage.id,
              threadId,
              role: "assistant",
              parts: responseMessage.parts as unknown as Prisma.InputJsonValue,
            },
            update: {
              parts: responseMessage.parts as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          console.error("[agent] no se pudo persistir la respuesta", error);
        }
      },
    }),
  });
}
