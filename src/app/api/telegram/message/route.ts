import {
  convertToModelMessages,
  generateId,
  generateText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prismaSystem } from "@/lib/prisma";
import { forOrg, getOrgSettings, type TenantClient } from "@/lib/tenant";
import { agentConfig } from "@/lib/agent/config";
import { appUrl } from "@/lib/meeting-intelligence/config";
import { resolveAgentModel } from "@/lib/agent/model";
import { buildAgentSystemPrompt } from "@/lib/agent/system-prompt";
import { buildAgentTools } from "@/lib/agent/executor";
import {
  CRM_OBSERVABILITY_SERVICE_NAME,
  CRM_OBSERVABILITY_SERVICE_SLUG,
  aiCallFromModelSpec,
  reportAiEventBestEffort,
} from "@/lib/observability";
import { authorizeTelegramRequest } from "@/lib/telegram/auth";
import {
  normalizeChatId,
  resolveActiveTelegramLink,
  type ActiveTelegramLink,
} from "@/lib/telegram/link";

// POST /api/telegram/message — conversación con el copiloto por Telegram.
// n8n solo manda el texto actual (no el historial como el chat web), así que
// reconstruimos la memoria desde la DB: un thread persistente por chat y los
// últimos N mensajes. Reutiliza la misma lógica del agente que el chat web
// (mismas tools, mismo modelo, mismo system prompt) pero SIN streaming.
// Devuelve { output } (el nodo de Telegram lee body.output).

// Multi-step tool loops (search → read → act) pueden tardar en modelos lentos.
export const maxDuration = 120;

type MessageBody = { chat_id?: unknown; text?: unknown };

const NOT_LINKED_MESSAGE =
  "⚠️ Tu cuenta de Telegram no está vinculada. Andá a *Configuración → Telegram* en el CRM, generá un código y enviámelo con `/vincular <código>`.";
const EMPTY_TEXT_MESSAGE =
  "No recibí texto. Escribime o mandame un audio con tu consulta.";
const ERROR_MESSAGE =
  "💥 Ocurrió un error al procesar tu mensaje. Probá de nuevo en unos minutos.";

export async function POST(request: NextRequest) {
  const auth = authorizeTelegramRequest(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: MessageBody;
  try {
    body = (await request.json()) as MessageBody;
  } catch {
    return NextResponse.json({ output: ERROR_MESSAGE });
  }

  const chatId = normalizeChatId(body.chat_id);
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!chatId) {
    return NextResponse.json({ output: NOT_LINKED_MESSAGE });
  }

  const link = await resolveActiveTelegramLink(chatId);
  if (!link) {
    return NextResponse.json({ output: NOT_LINKED_MESSAGE });
  }
  if (!text) {
    return NextResponse.json({ output: EMPTY_TEXT_MESSAGE });
  }

  try {
    const db = forOrg(link.organizationId);
    const threadId = await ensureTelegramThread(db, link);

    // Últimos N mensajes en orden cronológico (reemplaza la Window Buffer Memory).
    const recentRows = await db.agentChatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      take: agentConfig.maxContextMessages,
      select: { id: true, role: true, parts: true },
    });
    const history = recentRows.reverse().map(
      (row) =>
        ({
          id: row.id,
          role: row.role,
          parts: row.parts,
        }) as unknown as UIMessage,
    );

    const userMessage: UIMessage = {
      id: generateId(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    await db.agentChatMessage.create({
      data: {
        id: userMessage.id,
        organizationId: link.organizationId,
        threadId,
        role: "user",
        parts: userMessage.parts as unknown as Prisma.InputJsonValue,
      },
    });

    const org = await getOrgSettings(link.organizationId);
    const orgName = org?.brandName ?? org?.name ?? "tu organización";
    const startedAt = new Date();

    const result = await generateText({
      model: resolveAgentModel(),
      system: buildAgentSystemPrompt({
        orgName,
        pageContext: null,
        attachments: [],
        surface: "telegram",
      }),
      messages: await convertToModelMessages([...history, userMessage]),
      tools: buildAgentTools({
        organizationId: link.organizationId,
        db,
        userId: link.userId,
        threadId,
        pageContext: null,
      }),
      stopWhen: stepCountIs(agentConfig.maxSteps),
    });

    const baseText =
      result.text.trim() ||
      "No pude generar una respuesta. Reformulá tu consulta e intentá de nuevo.";

    // Si el turno generó propuestas pendientes, anexar el deep link para
    // aprobarlas desde la web (Telegram no puede mostrar el diff/aprobar inline).
    const newProposalCount = await db.cRMChangeProposal.count({
      where: {
        chatThreadId: threadId,
        source: "agent",
        status: "pending",
        createdAt: { gte: startedAt },
      },
    });
    const output = baseText + buildProposalsFooter(newProposalCount);

    await db.agentChatMessage.create({
      data: {
        id: generateId(),
        organizationId: link.organizationId,
        threadId,
        role: "assistant",
        parts: [
          { type: "text", text: output },
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    reportAiEventBestEffort({
      execution_id: `telegram-chat:${threadId}:${userMessage.id}`,
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      status: result.finishReason === "error" ? "error" : "success",
      workflow_name: "agent-copilot",
      agent_name: "crm-copilot",
      source_type: "backend",
      service_name: CRM_OBSERVABILITY_SERVICE_NAME,
      service_slug: CRM_OBSERVABILITY_SERVICE_SLUG,
      flow_slug: "telegram-chat",
      usage_kind: "agent_run",
      metadata: { organizationId: link.organizationId, threadId },
      calls: [aiCallFromModelSpec(agentConfig.modelSpec, result.usage)],
    });

    return NextResponse.json({ output });
  } catch (error) {
    console.error("[telegram/message] error", error);
    return NextResponse.json({ output: ERROR_MESSAGE });
  }
}

// Escape-hatch a la web. El agente ya resume y pide confirmación en su propio
// texto (surface=telegram); acá solo agregamos el link para revisar el diff /
// aprobar desde la web. Devuelve "" si el turno no creó propuestas.
function buildProposalsFooter(newProposalCount: number): string {
  if (newProposalCount === 0) return "";
  return `\n\n🔎 Ver detalle o aprobar en la web: ${appUrl()}/agent/proposals`;
}

// Devuelve el thread persistente del chat, creándolo (lazy) en el primer mensaje
// y guardando su id en el TelegramLink para reutilizarlo en los siguientes turnos.
async function ensureTelegramThread(
  db: TenantClient,
  link: ActiveTelegramLink,
): Promise<string> {
  if (link.agentThreadId) return link.agentThreadId;
  const thread = await db.agentChatThread.create({
    data: {
      organizationId: link.organizationId,
      userId: link.userId,
      contextType: null,
      contextId: null,
    },
    select: { id: true },
  });
  await prismaSystem.telegramLink.update({
    where: { id: link.id },
    data: { agentThreadId: thread.id },
  });
  return thread.id;
}
