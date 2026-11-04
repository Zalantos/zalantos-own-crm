import { defineAgentTool } from "@/lib/agent/tool-definition";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AgentToolContext } from "@/lib/agent/executor";
import { LEGACY_MEETING_SOURCE } from "@/lib/crm/activity-records";
import type { TenantClient } from "@/lib/tenant";

const ITEM_TEXT_MAX_CHARS = 150;

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
      typeof after.dueInDays === "number"
        ? ` (vence en ${after.dueInDays} días)`
        : "";
    return `Tarea: ${after.title}${due}`;
  }
  if (item.type === "stage_change" && typeof after?.value === "string") {
    return `Cambiar etapa a ${after.value}`;
  }
  return truncate(item.explanation, ITEM_TEXT_MAX_CHARS);
}

const meetingSelect = {
  id: true,
  title: true,
  channel: true,
  occurredAt: true,
  description: true,
  outcomes: true,
  durationMinutes: true,
  externalSource: true,
  company: { select: { id: true, name: true } },
  opportunity: { select: { id: true, name: true } },
  commercialLead: { select: { id: true, title: true } },
  participants: {
    select: { person: { select: { id: true, firstName: true, lastName: true } } },
  },
} satisfies Prisma.ActivitySelect;

// Una reunión es una Activity(type=meeting). Acepta también el id histórico de
// la tabla meetings, que puede seguir citado en conversaciones y timeline.
export async function findMeetingActivityId(
  db: TenantClient,
  meetingId: string,
): Promise<string | null> {
  const meeting = await db.activity.findFirst({
    where: {
      type: "meeting",
      OR: [
        { id: meetingId },
        { externalSource: LEGACY_MEETING_SOURCE, externalId: meetingId },
      ],
    },
    select: { id: true },
  });
  return meeting?.id ?? null;
}

function headline(description: string | null) {
  const firstLine = description?.split("\n")[0]?.trim();
  return firstLine ? truncate(firstLine, ITEM_TEXT_MAX_CHARS) : null;
}

export function buildMeetingTools(ctx: AgentToolContext) {
  const db = ctx.db;
  return {
    list_meetings: defineAgentTool({
      description:
        "Lista las reuniones comerciales más recientes, opcionalmente de una empresa, oportunidad o prospecto, con su titular de resumen.",
      inputSchema: z.object({
        companyId: z.string().optional(),
        opportunityId: z.string().optional(),
        commercialLeadId: z.string().optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Cantidad de reuniones (default 5)"),
      }),
      execute: async ({ companyId, opportunityId, commercialLeadId, limit }) => {
        const meetings = await db.activity.findMany({
          where: {
            type: "meeting",
            occurredAt: { not: null },
            ...(companyId ? { companyId } : {}),
            ...(opportunityId ? { opportunityId } : {}),
            ...(commercialLeadId ? { commercialLeadId } : {}),
          },
          orderBy: { occurredAt: "desc" },
          take: limit ?? 5,
          select: meetingSelect,
        });
        return {
          meetings: meetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            meetingType: meeting.channel,
            date: meeting.occurredAt?.toISOString() ?? null,
            companyName: meeting.company?.name ?? null,
            headline: headline(meeting.description),
          })),
        };
      },
    }),

    get_meeting: defineAgentTool({
      description:
        "Detalle de una reunión comercial: fecha, participantes, empresa, prospecto u oportunidad, resumen, acuerdos y próximas acciones.",
      inputSchema: z.object({ meetingId: z.string().min(1) }),
      execute: async ({ meetingId }) => {
        const activityId = await findMeetingActivityId(db, meetingId);
        const meeting = activityId
          ? await db.activity.findUnique({
              where: { id: activityId },
              select: meetingSelect,
            })
          : null;
        if (!meeting) return { error: `Reunión no encontrada: ${meetingId}` };
        return {
          id: meeting.id,
          title: meeting.title,
          meetingType: meeting.channel,
          date: meeting.occurredAt?.toISOString() ?? null,
          durationMinutes: meeting.durationMinutes,
          companyId: meeting.company?.id ?? null,
          companyName: meeting.company?.name ?? null,
          opportunityId: meeting.opportunity?.id ?? null,
          opportunityName: meeting.opportunity?.name ?? null,
          commercialLeadId: meeting.commercialLead?.id ?? null,
          commercialLeadTitle: meeting.commercialLead?.title ?? null,
          participants: meeting.participants.map(({ person }) => ({
            id: person.id,
            name: `${person.firstName} ${person.lastName}`.trim(),
          })),
          summary: meeting.description,
          outcomes: meeting.outcomes,
        };
      },
    }),

    list_pending_proposals: defineAgentTool({
      description:
        "Lista acciones destructivas y propuestas legacy pendientes de aprobación, con sus ítems, confianza y evidencia. Los cambios no destructivos nuevos se ejecutan directamente y aparecen en Actividad de IA.",
      inputSchema: z.object({
        companyId: z.string().optional(),
        meetingId: z.string().optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Cantidad de propuestas (default 5)"),
      }),
      execute: async ({ companyId, meetingId, limit }) => {
        const proposals = await db.cRMChangeProposal.findMany({
          where: {
            status: "pending",
            // Sin items pendientes no hay nada que revisar: es ruido.
            items: { some: { status: "pending" } },
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
              evidence: item.evidence
                ? truncate(item.evidence, ITEM_TEXT_MAX_CHARS)
                : null,
            })),
            reviewUrl: "/agent/proposals",
          })),
        };
      },
    }),
  };
}
