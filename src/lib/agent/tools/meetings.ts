import { tool } from "ai";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AgentToolContext } from "@/lib/agent/executor";

const TRANSCRIPT_PAGE_SIZE = 12_000;
const ITEM_TEXT_MAX_CHARS = 150;

// aiSummary es Json sin tipo: narrowing manual para extraer el titular.
export function extractHeadline(aiSummary: unknown): string | null {
  if (typeof aiSummary !== "object" || aiSummary === null) return null;
  const headline = (aiSummary as Record<string, unknown>).headline;
  return typeof headline === "string" ? headline : null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Resumen legible de un item de propuesta. Los tipos con afterValue de shape
// conocido se formatean; el resto cae a la explanation del modelo.
function summarizeItem(item: {
  type: string;
  afterValue: Prisma.JsonValue | null;
  explanation: string;
}): string {
  const after = asRecord(item.afterValue);
  if (item.type === "create_task" && typeof after?.title === "string") {
    const due =
      typeof after.dueInDays === "number" ? ` (vence en ${after.dueInDays} días)` : "";
    return `Tarea: ${after.title}${due}`;
  }
  if (item.type === "stage_change" && typeof after?.value === "string") {
    return `Cambiar etapa a ${after.value}`;
  }
  return truncate(item.explanation, ITEM_TEXT_MAX_CHARS);
}

export function buildMeetingTools(ctx: AgentToolContext) {
  const db = ctx.db;
  return {
    list_meetings: tool({
      description:
        "Lista las reuniones más recientes, opcionalmente de una empresa u oportunidad, con su titular de resumen y cuántas propuestas pendientes tienen.",
      inputSchema: z.object({
        companyId: z.string().optional(),
        opportunityId: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional().describe("Cantidad de reuniones (default 5)"),
      }),
      execute: async ({ companyId, opportunityId, limit }) => {
        const meetings = await db.meeting.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            ...(opportunityId ? { opportunityId } : {}),
          },
          orderBy: { meetingDate: "desc" },
          take: limit ?? 5,
          select: {
            id: true,
            title: true,
            meetingType: true,
            meetingDate: true,
            processingStatus: true,
            aiSummary: true,
            company: { select: { name: true } },
            proposals: { where: { status: "pending" }, select: { id: true } },
          },
        });
        return {
          meetings: meetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            meetingType: meeting.meetingType,
            date: meeting.meetingDate.toISOString(),
            processingStatus: meeting.processingStatus,
            companyName: meeting.company.name,
            headline: extractHeadline(meeting.aiSummary),
            pendingProposals: meeting.proposals.length,
          })),
        };
      },
    }),

    get_meeting: tool({
      description:
        "Devuelve el detalle de una reunión: participantes, resumen IA completo (puntos clave, riesgos, decisiones) y cuántos caracteres tiene la transcripción.",
      inputSchema: z.object({
        meetingId: z.string().min(1),
      }),
      execute: async ({ meetingId }) => {
        const meeting = await db.meeting.findUnique({
          where: { id: meetingId },
          select: {
            id: true,
            title: true,
            meetingType: true,
            meetingDate: true,
            participants: true,
            processingStatus: true,
            aiSummary: true,
            rawTranscript: true,
            company: { select: { id: true, name: true } },
            opportunity: { select: { id: true, name: true } },
            proposals: { where: { status: "pending" }, select: { id: true } },
          },
        });
        if (!meeting) return { error: `Reunión no encontrada: ${meetingId}` };
        const isReady = meeting.processingStatus === "ready";
        return {
          id: meeting.id,
          title: meeting.title,
          meetingType: meeting.meetingType,
          date: meeting.meetingDate.toISOString(),
          processingStatus: meeting.processingStatus,
          companyId: meeting.company.id,
          companyName: meeting.company.name,
          opportunityId: meeting.opportunity?.id ?? null,
          opportunityName: meeting.opportunity?.name ?? null,
          participants: meeting.participants,
          // Antes de "ready" el resumen no existe o está incompleto.
          summary: isReady ? meeting.aiSummary : null,
          transcriptChars: meeting.rawTranscript?.length ?? 0,
          pendingProposals: meeting.proposals.length,
        };
      },
    }),

    read_meeting_transcript: tool({
      description:
        "Lee la transcripción completa de una reunión, por páginas. Usala solo cuando el resumen de get_meeting no alcance.",
      inputSchema: z.object({
        meetingId: z.string().min(1),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Posición (en caracteres) desde donde leer"),
      }),
      execute: async ({ meetingId, offset }) => {
        const meeting = await db.meeting.findUnique({
          where: { id: meetingId },
          select: { title: true, rawTranscript: true },
        });
        if (!meeting) return { error: `Reunión no encontrada: ${meetingId}` };
        if (!meeting.rawTranscript) {
          return { error: "La reunión no tiene transcripción disponible" };
        }
        const start = offset ?? 0;
        const total = meeting.rawTranscript.length;
        return {
          meetingId,
          title: meeting.title,
          offset: start,
          totalChars: total,
          hasMore: start + TRANSCRIPT_PAGE_SIZE < total,
          text: meeting.rawTranscript.slice(start, start + TRANSCRIPT_PAGE_SIZE),
        };
      },
    }),

    list_pending_proposals: tool({
      description:
        "Lista propuestas de cambios al CRM pendientes de revisión (de reuniones o del agente) con sus items, confianza y evidencia. Los items de reuniones se aprueban en la página de la reunión, no se recrean con create_task.",
      inputSchema: z.object({
        companyId: z.string().optional(),
        meetingId: z.string().optional(),
        limit: z.number().int().min(1).max(10).optional().describe("Cantidad de propuestas (default 5)"),
      }),
      execute: async ({ companyId, meetingId, limit }) => {
        const proposals = await db.cRMChangeProposal.findMany({
          where: {
            status: "pending",
            // Sin items pendientes no hay nada que revisar: es ruido.
            items: { some: { status: "pending" } },
            // Las propuestas de enrichment se revisan en la ficha, no en chat.
            source: { in: ["meeting", "agent"] },
            ...(meetingId ? { meetingId } : {}),
            // companyId es denormalizado y puede faltar en filas legacy:
            // matchear también por la empresa de la reunión.
            ...(companyId
              ? { OR: [{ companyId }, { meeting: { companyId } }] }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit ?? 5,
          include: {
            items: { where: { status: "pending" } },
            meeting: { select: { id: true, title: true, meetingDate: true } },
          },
        });
        return {
          proposals: proposals.map((proposal) => ({
            proposalId: proposal.id,
            source: proposal.source,
            createdAt: proposal.createdAt.toISOString(),
            companyId: proposal.companyId ?? null,
            meeting: proposal.meeting
              ? {
                  id: proposal.meeting.id,
                  title: proposal.meeting.title,
                  date: proposal.meeting.meetingDate.toISOString(),
                }
              : null,
            items: proposal.items.map((item) => ({
              itemId: item.id,
              type: item.type,
              entity: item.entity,
              summary: summarizeItem(item),
              confidence: item.confidence,
              evidence: item.evidence ? truncate(item.evidence, ITEM_TEXT_MAX_CHARS) : null,
            })),
            reviewUrl:
              proposal.source === "meeting" && proposal.meeting
                ? `/meetings/${proposal.meeting.id}`
                : null,
          })),
        };
      },
    }),
  };
}
