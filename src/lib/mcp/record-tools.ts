import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { defineAgentTool } from "@/lib/agent/tool-definition";
import type { AgentToolContext } from "@/lib/agent/executor";
import {
  LOGGED_ACTIVITY_TYPES,
  buildManualMeetingSummary,
  normalizeMeetingParticipants,
  type ManualMeetingInput,
} from "@/lib/crm/activity-records";
import { appendTimelineEvent } from "@/lib/timeline";
import { withOrgTransaction } from "@/lib/tenant";
import {
  assertCompany,
  assertOpportunityOfCompany,
  assertPeople,
  emptyToNull,
  isoDateString,
} from "@/lib/agent/tools/record-lookup";

const FUTURE_ACTIVITY_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const nullableIsoDate = (description: string) =>
  isoDateString(description).nullable().optional();

const participantSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  internal: z.boolean().optional(),
});

const noteUpdateSchema = z
  .object({
    noteId: z.string().min(1).describe("Id devuelto por list_notes"),
    title: z.string().nullable().optional(),
    body: z.string().min(1).optional(),
  })
  .refine((value) => value.title !== undefined || value.body !== undefined, {
    message: "Indicá title o body para actualizar la nota",
  });

const activityUpdateSchema = z
  .object({
    activityId: z
      .string()
      .min(1)
      .describe("Id de una actividad ocurrida devuelto por list_activities"),
    companyId: z.string().min(1).optional(),
    opportunityId: z.string().nullable().optional(),
    personIds: z.array(z.string().min(1)).max(50).optional(),
    type: z.enum(LOGGED_ACTIVITY_TYPES).optional(),
    title: z.string().min(1).optional(),
    date: isoDateString(
      "Nueva fecha/hora de ocurrencia en ISO 8601",
    ).optional(),
    durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    channel: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    outcomes: z.string().nullable().optional(),
  })
  .refine(
    (value) =>
      Object.entries(value).some(
        ([field, update]) => field !== "activityId" && update !== undefined,
      ),
    { message: "Indicá al menos un campo para actualizar la actividad" },
  );

const meetingUpdateSchema = z
  .object({
    meetingId: z.string().min(1).describe("Id devuelto por list_meetings"),
    companyId: z.string().min(1).optional(),
    opportunityId: z.string().nullable().optional(),
    title: z.string().min(1).optional(),
    date: isoDateString(
      "Nueva fecha/hora de la reunión en ISO 8601",
    ).optional(),
    meetingType: z.string().min(1).optional(),
    participants: z.array(participantSchema).max(50).optional(),
    status: z.string().min(1).optional(),
    summary: z.string().nullable().optional(),
    keyPoints: z.array(z.string()).optional(),
    decisions: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    nextSteps: z.array(z.string()).optional(),
  })
  .refine(
    (value) =>
      Object.entries(value).some(
        ([field, update]) => field !== "meetingId" && update !== undefined,
      ),
    { message: "Indicá al menos un campo para actualizar la reunión" },
  );

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function buildMcpRecordTools(ctx: AgentToolContext) {
  return {
    list_companies: defineAgentTool({
      description:
        "Lista empresas del CRM sin exigir conocer previamente su nombre. Devuelve ids para usar en las demás tools.",
      inputSchema: z.object({
        query: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ query, status, limit }) => ({
        companies: await ctx.db.company.findMany({
          where: {
            ...(query
              ? { name: { contains: query, mode: "insensitive" as const } }
              : {}),
            ...(status ? { status } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            name: true,
            website: true,
            industry: true,
            city: true,
            country: true,
            status: true,
            priority: true,
            updatedAt: true,
          },
        }),
      }),
    }),

    list_people: defineAgentTool({
      description:
        "Lista contactos sin exigir conocer previamente su nombre. Permite filtrar por empresa y devuelve ids para las demás tools.",
      inputSchema: z.object({
        query: z.string().optional(),
        companyId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ query, companyId, limit }) => ({
        people: await ctx.db.person.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            ...(query
              ? {
                  OR: [
                    {
                      firstName: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      lastName: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      email: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                }
              : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            roleTitle: true,
            company: { select: { id: true, name: true } },
            updatedAt: true,
          },
        }),
      }),
    }),

    list_team_members: defineAgentTool({
      description:
        "Lista miembros del equipo y sus ids/emails para asignar tareas o registrar quién las completó.",
      inputSchema: z.object({
        query: z.string().optional(),
        includeInactive: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ query, includeInactive, limit }) => ({
        teamMembers: await ctx.db.teamMember.findMany({
          where: {
            ...(includeInactive ? {} : { isActive: true }),
            ...(query
              ? {
                  OR: [
                    {
                      name: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      email: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                }
              : {}),
          },
          orderBy: { name: "asc" },
          take: limit ?? 50,
          select: {
            id: true,
            userId: true,
            name: true,
            email: true,
            isActive: true,
          },
        }),
      }),
    }),

    list_notes: defineAgentTool({
      description:
        "Lista notas para localizar noteId y leer su contenido antes de usar update_note. Permite filtrar por empresa, persona u oportunidad.",
      inputSchema: z.object({
        companyId: z.string().optional(),
        personId: z.string().optional(),
        opportunityId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ companyId, personId, opportunityId, limit }) => ({
        notes: await ctx.db.note.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            ...(personId ? { personId } : {}),
            ...(opportunityId ? { opportunityId } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            title: true,
            body: true,
            companyId: true,
            personId: true,
            opportunityId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      }),
    }),

    update_note: defineAgentTool({
      description:
        "Edita el título y/o contenido de una nota existente. Solo cambia los campos enviados. Resolvé noteId con list_notes; nunca inventes un id.",
      inputSchema: noteUpdateSchema,
      execute: async ({ noteId, title, body }) => {
        const note = await ctx.db.note.findUnique({
          where: { id: noteId },
          select: {
            id: true,
            companyId: true,
            opportunityId: true,
            title: true,
          },
        });
        if (!note) throw new Error(`Nota no encontrada: ${noteId}`);

        return withOrgTransaction(ctx.organizationId, async (tx) => {
          const updated = await tx.note.update({
            where: { id: noteId, organizationId: ctx.organizationId },
            data: {
              ...(title !== undefined ? { title: emptyToNull(title) } : {}),
              ...(body !== undefined ? { body } : {}),
            },
            select: { id: true, title: true, body: true, updatedAt: true },
          });
          await appendTimelineEvent(tx, {
            organizationId: ctx.organizationId,
            companyId: note.companyId,
            opportunityId: note.opportunityId,
            type: "note_updated",
            title: `Nota actualizada: ${updated.title ?? note.title ?? "Sin título"}`,
            refType: "note",
            refId: noteId,
            actorId: ctx.userId,
            metadata: { via: "mcp" },
          });
          return { status: "updated" as const, note: updated };
        });
      },
    }),

    list_activities: defineAgentTool({
      description:
        "Lista actividades comerciales ya ocurridas (no tareas) y devuelve activityId para update_activity.",
      inputSchema: z.object({
        companyId: z.string().optional(),
        opportunityId: z.string().optional(),
        personId: z.string().optional(),
        type: z.array(z.enum(LOGGED_ACTIVITY_TYPES)).optional(),
        occurredAfter: nullableIsoDate(
          "Fecha mínima de ocurrencia en ISO 8601",
        ),
        occurredBefore: nullableIsoDate(
          "Fecha máxima de ocurrencia en ISO 8601",
        ),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (args) => {
        const activities = await ctx.db.activity.findMany({
          where: {
            occurredAt: {
              not: null,
              ...(args.occurredAfter
                ? { gte: new Date(args.occurredAfter) }
                : {}),
              ...(args.occurredBefore
                ? { lte: new Date(args.occurredBefore) }
                : {}),
            },
            ...(args.companyId ? { companyId: args.companyId } : {}),
            ...(args.opportunityId
              ? { opportunityId: args.opportunityId }
              : {}),
            ...(args.personId
              ? {
                  OR: [
                    { personId: args.personId },
                    { participants: { some: { personId: args.personId } } },
                  ],
                }
              : {}),
            ...(args.type?.length ? { type: { in: args.type } } : {}),
          },
          orderBy: { occurredAt: "desc" },
          take: args.limit ?? 20,
          select: {
            id: true,
            companyId: true,
            opportunityId: true,
            type: true,
            title: true,
            description: true,
            occurredAt: true,
            durationMinutes: true,
            channel: true,
            outcomes: true,
            participants: { select: { personId: true } },
          },
        });
        return {
          activities: activities.map((activity) => ({
            activityId: activity.id,
            companyId: activity.companyId,
            opportunityId: activity.opportunityId,
            personIds: activity.participants.map(({ personId }) => personId),
            type: activity.type,
            title: activity.title,
            summary: activity.description,
            date: activity.occurredAt?.toISOString() ?? null,
            durationMinutes: activity.durationMinutes,
            channel: activity.channel,
            outcomes: activity.outcomes,
          })),
        };
      },
    }),

    update_activity: defineAgentTool({
      description:
        "Edita cualquier campo operativo de una actividad ya ocurrida: empresa, oportunidad, participantes, tipo, título, fecha, duración, canal, resumen y resultados. Para tareas pendientes usá update_task. Resolvé activityId con list_activities; nunca inventes un id.",
      inputSchema: activityUpdateSchema,
      execute: async (args) => {
        const current = await ctx.db.activity.findUnique({
          where: { id: args.activityId },
          select: {
            id: true,
            companyId: true,
            opportunityId: true,
            occurredAt: true,
            participants: { select: { personId: true } },
          },
        });
        if (!current?.occurredAt) {
          throw new Error(
            `Actividad ocurrida no encontrada: ${args.activityId}. Para tareas usá update_task.`,
          );
        }

        const companyId = args.companyId ?? current.companyId;
        if (!companyId) throw new Error("La actividad debe tener una empresa");
        await assertCompany(ctx.db, companyId);
        const opportunityId =
          args.opportunityId === undefined
            ? current.opportunityId
            : args.opportunityId;
        if (opportunityId) {
          await assertOpportunityOfCompany(ctx.db, opportunityId, companyId);
        }
        const personIds =
          args.personIds === undefined
            ? current.participants.map(({ personId }) => personId)
            : await assertPeople(ctx.db, args.personIds);
        const occurredAt = args.date ? new Date(args.date) : current.occurredAt;
        if (occurredAt.getTime() > Date.now() + FUTURE_ACTIVITY_TOLERANCE_MS) {
          throw new Error(
            "La fecha es futura: update_activity solo edita actividades que ya ocurrieron. Para algo pendiente usá create_task.",
          );
        }

        return withOrgTransaction(ctx.organizationId, async (tx) => {
          const updated = await tx.activity.update({
            where: {
              id: args.activityId,
              organizationId: ctx.organizationId,
            },
            data: {
              companyId,
              opportunityId,
              personId: personIds[0] ?? null,
              ...(args.type !== undefined ? { type: args.type } : {}),
              ...(args.title !== undefined ? { title: args.title } : {}),
              ...(args.date !== undefined
                ? { occurredAt, completedAt: occurredAt }
                : {}),
              ...(args.durationMinutes !== undefined
                ? { durationMinutes: args.durationMinutes }
                : {}),
              ...(args.channel !== undefined
                ? { channel: emptyToNull(args.channel) }
                : {}),
              ...(args.summary !== undefined
                ? { description: emptyToNull(args.summary) }
                : {}),
              ...(args.outcomes !== undefined
                ? { outcomes: emptyToNull(args.outcomes) }
                : {}),
              ...(args.personIds !== undefined
                ? {
                    participants: {
                      deleteMany: {},
                      create: personIds.map((personId) => ({
                        organizationId: ctx.organizationId,
                        personId,
                      })),
                    },
                  }
                : {}),
            },
            select: {
              id: true,
              companyId: true,
              opportunityId: true,
              type: true,
              title: true,
              occurredAt: true,
              durationMinutes: true,
              channel: true,
              description: true,
              outcomes: true,
            },
          });

          if (occurredAt.getTime() <= Date.now()) {
            await tx.company.updateMany({
              where: {
                id: companyId,
                organizationId: ctx.organizationId,
                OR: [
                  { lastContactAt: null },
                  { lastContactAt: { lt: occurredAt } },
                ],
              },
              data: { lastContactAt: occurredAt },
            });
          }
          await appendTimelineEvent(tx, {
            organizationId: ctx.organizationId,
            companyId,
            opportunityId,
            type: "activity_updated",
            title: `Actividad actualizada: ${updated.title}`,
            refType: "activity",
            refId: updated.id,
            actorId: ctx.userId,
            metadata: { via: "mcp" },
          });
          return {
            status: "updated" as const,
            activity: {
              ...updated,
              personIds,
              summary: updated.description,
            },
          };
        });
      },
    }),

    update_meeting: defineAgentTool({
      description:
        "Edita una reunión existente: empresa, oportunidad, título, fecha, tipo, participantes y estado. En reuniones manuales también permite editar resumen, puntos clave, decisiones, riesgos y próximos pasos. Resolvé meetingId con list_meetings; nunca inventes un id.",
      inputSchema: meetingUpdateSchema,
      execute: async (args) => {
        const current = await ctx.db.meeting.findUnique({
          where: { id: args.meetingId },
          select: {
            id: true,
            companyId: true,
            opportunityId: true,
            title: true,
            meetingType: true,
            meetingDate: true,
            participants: true,
            status: true,
            sourceType: true,
            aiSummary: true,
          },
        });
        if (!current)
          throw new Error(`Reunión no encontrada: ${args.meetingId}`);

        const companyId = args.companyId ?? current.companyId;
        await assertCompany(ctx.db, companyId);
        const opportunityId =
          args.opportunityId === undefined
            ? current.opportunityId
            : args.opportunityId;
        if (opportunityId) {
          await assertOpportunityOfCompany(ctx.db, opportunityId, companyId);
        }

        const editsSummary =
          args.summary !== undefined ||
          args.keyPoints !== undefined ||
          args.decisions !== undefined ||
          args.risks !== undefined ||
          args.nextSteps !== undefined;
        if (editsSummary && current.sourceType !== "manual") {
          throw new Error(
            "El resumen estructurado solo se edita en reuniones manuales; una reunión procesada conserva su resultado de IA.",
          );
        }

        const oldSummary = jsonRecord(current.aiSummary);
        const participants =
          args.participants ??
          (Array.isArray(current.participants)
            ? (current.participants as z.output<typeof participantSchema>[])
            : []);
        const summaryInput: ManualMeetingInput = {
          companyId,
          opportunityId,
          title: args.title ?? current.title,
          meetingType: args.meetingType ?? current.meetingType,
          meetingDate: args.date ? new Date(args.date) : current.meetingDate,
          participants,
          summary:
            args.summary === undefined
              ? typeof oldSummary.headline === "string"
                ? oldSummary.headline
                : null
              : emptyToNull(args.summary),
          keyPoints: args.keyPoints ?? stringList(oldSummary.keyPoints),
          decisions: args.decisions ?? stringList(oldSummary.decisions),
          risks: args.risks ?? stringList(oldSummary.risks),
          nextSteps: args.nextSteps ?? stringList(oldSummary.nextSteps),
        };

        return withOrgTransaction(ctx.organizationId, async (tx) => {
          const updated = await tx.meeting.update({
            where: { id: args.meetingId, organizationId: ctx.organizationId },
            data: {
              companyId,
              opportunityId,
              ...(args.title !== undefined ? { title: args.title } : {}),
              ...(args.date !== undefined
                ? { meetingDate: new Date(args.date) }
                : {}),
              ...(args.meetingType !== undefined
                ? { meetingType: args.meetingType }
                : {}),
              ...(args.participants !== undefined
                ? {
                    participants: normalizeMeetingParticipants(
                      args.participants,
                    ) as Prisma.InputJsonValue,
                  }
                : {}),
              ...(args.status !== undefined ? { status: args.status } : {}),
              ...(editsSummary
                ? {
                    aiSummary: buildManualMeetingSummary(
                      summaryInput,
                    ) as Prisma.InputJsonValue,
                  }
                : {}),
            },
            select: {
              id: true,
              companyId: true,
              opportunityId: true,
              title: true,
              meetingType: true,
              meetingDate: true,
              participants: true,
              status: true,
              sourceType: true,
              aiSummary: true,
              updatedAt: true,
            },
          });
          await appendTimelineEvent(tx, {
            organizationId: ctx.organizationId,
            companyId,
            opportunityId,
            type: "meeting_updated",
            title: `Reunión actualizada: ${updated.title}`,
            refType: "meeting",
            refId: updated.id,
            actorId: ctx.userId,
            metadata: { via: "mcp" },
          });
          return { status: "updated" as const, meeting: updated };
        });
      },
    }),
  };
}
