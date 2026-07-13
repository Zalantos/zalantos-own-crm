import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
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
import {
  CRM_OBSERVABILITY_SERVICE_NAME,
  CRM_OBSERVABILITY_SERVICE_SLUG,
  aiCallFromLanguageModelUsage,
  reportAiEventBestEffort,
} from "@/lib/observability";
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
  const startedAt = new Date();
  const userMessageId = userMessage?.id ?? generateId();

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
    onError: ({ error }) => {
      // El stream UI enmascara el error como "An error occurred", así que sin
      // esto la causa real solo llegaba a observabilidad. Logueado para poder
      // diagnosticar en el server.
      console.error("[agent] streamText error", error);
      reportAiEventBestEffort({
        execution_id: `agent-chat:${threadId}:${userMessageId}`,
        started_at: startedAt.toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        status: "error",
        error_message:
          error instanceof Error ? error.message : String(error),
        workflow_name: "agent-copilot",
        agent_name: "crm-copilot",
        source_type: "backend",
        service_name: CRM_OBSERVABILITY_SERVICE_NAME,
        service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
        flow_slug: "agent-chat",
        usage_kind: "agent_run",
        metadata: { organizationId: org.id, threadId },
      });
    },
    onFinish: ({ steps, callId, finishReason }) => {
      reportAiEventBestEffort({
        execution_id: `agent-chat:${threadId}:${callId || userMessageId}`,
        started_at: startedAt.toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        status: finishReason === "error" ? "error" : "success",
        workflow_name: "agent-copilot",
        agent_name: "crm-copilot",
        source_type: "backend",
        service_name: CRM_OBSERVABILITY_SERVICE_NAME,
        service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
        flow_slug: "agent-chat",
        usage_kind: "agent_run",
        metadata: { organizationId: org.id, threadId },
        calls: steps.map((step) =>
          aiCallFromLanguageModelUsage(
            step.model.provider,
            step.model.modelId,
            step.usage,
          ),
        ),
      });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      // Sin esto el SDK enmascara todo error del stream como "An error
      // occurred". Devolvemos el mensaje real para poder diagnosticar.
      onError: (error) => {
        console.error("[agent] UI stream error", error);
        return error instanceof Error ? error.message : String(error);
      },
      // Sin esto el SDK deja responseMessage.id como "" y todos los turnos
      // del asistente colisionan en una única fila del upsert de abajo.
      generateMessageId: generateId,
      onEnd: async ({ responseMessage }) => {
        try {
          const messageId = responseMessage.id || generateId();
          await db.agentChatMessage.upsert({
            where: { id: messageId },
            create: {
              id: messageId,
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
    consumeSseStream: consumeStream,
  });
}
