import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { getOrgContext } from "@/lib/tenant";
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
  const ctx = await getOrgContext();
  if (!ctx) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const { user, org, db } = ctx;
  const userId = user.id;

  const { messages, threadId, context }: ChatRequestBody = await req.json();
  if (!threadId) {
    return Response.json({ error: "Falta threadId" }, { status: 400 });
  }

  const thread = await db.agentChatThread.findUnique({
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
    await db.agentChatMessage.upsert({
      where: { id: userMessage.id },
      create: {
        id: userMessage.id,
        organizationId: org.id,
        threadId,
        role: "user",
        parts: userMessage.parts as unknown as Prisma.InputJsonValue,
      },
      update: {
        parts: userMessage.parts as unknown as Prisma.InputJsonValue,
      },
    });
    await db.agentChatThread.update({
      where: { id: threadId },
      data: thread.title ? {} : { title: text.slice(0, 120) || null },
    });
  }

  const pageContext = context ? await resolvePageContext(db, context) : null;

  // The latest attachments of the thread ride along every turn (excerpt only);
  // the model pages through longer documents with read_attachment.
  const attachments = await db.agentAttachment.findMany({
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
      orgName: org.brandName ?? org.name,
      pageContext,
      attachments: promptAttachments,
    }),
    messages: await convertToModelMessages(recentMessages),
    tools: buildAgentTools({
      organizationId: org.id,
      db,
      userId,
      threadId,
      pageContext,
    }),
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
          await db.agentChatMessage.upsert({
            where: { id: responseMessage.id },
            create: {
              id: responseMessage.id,
              organizationId: org.id,
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
