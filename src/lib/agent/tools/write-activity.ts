import { defineAgentTool } from "@/lib/agent/tool-definition";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/agent/executor";
import {
  registerProposalChange,
  type AgentProposalItemInput,
} from "@/lib/agent/proposals";
import { ACTIVITY_TYPES, activityTypeLabel } from "@/lib/activity-types";
import {
  ACTIVITY_STATUS_LABELS,
  isActivityStatus,
  type ActivityStatus,
} from "@/lib/activity-status";
import { ACTIVITY_PRIORITIES } from "@/lib/activity-priority";
import {
  LOGGED_ACTIVITY_TYPES,
  applyTaskUpdate,
  diffTaskUpdate,
  insertLoggedActivity,
  insertManualMeeting,
  loggedActivityToJson,
  manualMeetingToJson,
  revertLoggedActivity,
  revertManualMeeting,
  revertTaskUpdate,
  taskUpdateToJson,
  type LoggedActivityInput,
  type ManualMeetingInput,
  type TaskUpdateInput,
  type WriteBase,
} from "@/lib/crm/activity-records";
import {
  ID_RULE,
  assertCompany,
  assertOpportunityOfCompany,
  assertPeople,
  defaultWriteToolDeps,
  emptyToNull,
  isoDateString,
  resolveAssignee,
  type WriteToolDeps,
} from "./record-lookup";

// Las actividades registradas pueden cargarse con algo de demora, pero no
// a futuro: para lo que todavía no pasó está create_task. Margen de un día
// por diferencias de zona horaria.
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const INSTANT_RULE =
  "Se aplica al instante SI es el único cambio del turno; si hay otro cambio en el mismo turno, queda junto a él en una propuesta para revisar.";

// Estados que acepta el agente: "pending" es el nombre natural de una tarea
// abierta y se guarda como "todo" (columna "Por hacer" del tablero).
export const TASK_STATUS_INPUTS = [
  "pending",
  "todo",
  "in_progress",
  "blocked",
  "done",
] as const;

export function toActivityStatus(
  status: (typeof TASK_STATUS_INPUTS)[number],
): ActivityStatus {
  return status === "pending" ? "todo" : status;
}

function preview(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function statusLabel(status: string): string {
  return isActivityStatus(status) ? ACTIVITY_STATUS_LABELS[status] : status;
}

const participantSchema = z.object({
  name: z.string().min(1).describe("Nombre del participante"),
  email: z.string().optional(),
  company: z.string().optional().describe("Empresa a la que pertenece"),
  role: z.string().optional().describe("Cargo o rol en la reunión"),
  internal: z
    .boolean()
    .optional()
    .describe("true si es del equipo interno; false si es del cliente"),
});

export const createActivityInputSchema = z.object({
  companyId: z.string().min(1),
  opportunityId: z.string().optional(),
  personIds: z
    .array(z.string().min(1))
    .max(50)
    .optional()
    .describe("Personas del CRM que participaron (ids de search_crm)"),
  type: z.enum(LOGGED_ACTIVITY_TYPES).describe("Tipo de actividad"),
  title: z.string().min(1),
  date: isoDateString(
    "Cuándo ocurrió, en ISO 8601 (p. ej. 2026-10-07T15:00:00-03:00)",
  ),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  channel: z
    .string()
    .optional()
    .describe("Medio: teams, zoom, meet, presencial, teléfono, whatsapp..."),
  summary: z.string().optional().describe("Qué se habló"),
  outcomes: z.string().optional().describe("Resultados o acuerdos concretos"),
});

export const createMeetingInputSchema = z.object({
  companyId: z.string().min(1),
  opportunityId: z.string().optional(),
  title: z.string().min(1),
  date: isoDateString("Fecha y hora de la reunión en ISO 8601"),
  meetingType: z
    .string()
    .optional()
    .describe(
      "discovery, seguimiento, técnica, comercial, demo, cierre... (default discovery)",
    ),
  participants: z.array(participantSchema).max(50).optional(),
  summary: z.string().optional().describe("Resumen breve de la reunión"),
  keyPoints: z.array(z.string()).optional(),
  decisions: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  nextSteps: z
    .array(z.string())
    .optional()
    .describe(
      "Próximos pasos como texto. No crea tareas: para eso usá create_task.",
    ),
});

export const updateTaskInputSchema = z.object({
  taskId: z.string().min(1).describe("Id de la tarea (de list_tasks)"),
  type: z.enum(ACTIVITY_TYPES).optional(),
  status: z
    .enum(TASK_STATUS_INPUTS)
    .optional()
    .describe(
      "pending (= por hacer), in_progress, blocked o done. No existe 'cancelled'.",
    ),
  dueDate: isoDateString("Nuevo vencimiento en ISO (YYYY-MM-DD)")
    .nullable()
    .optional()
    .describe("Nuevo vencimiento en ISO (YYYY-MM-DD); null para quitarlo"),
  plannedDate: isoDateString("Nueva fecha planificada en ISO (YYYY-MM-DD)")
    .nullable()
    .optional()
    .describe("Nueva fecha planificada; null para quitarla"),
  assigneeId: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Id del miembro del equipo (o de su usuario); null para dejarla sin responsable",
    ),
  assigneeEmail: z
    .string()
    .optional()
    .describe(
      "Email del miembro del equipo responsable (alternativa a assigneeId)",
    ),
  completedById: z
    .string()
    .nullable()
    .optional()
    .describe("Id del miembro que completó la tarea; null para limpiarlo"),
  completedByEmail: z
    .string()
    .optional()
    .describe("Email del miembro que completó la tarea"),
  title: z.string().min(1).optional(),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("Nueva descripción; null para vaciarla"),
  blockedReason: z
    .string()
    .nullable()
    .optional()
    .describe("Motivo del bloqueo; solo cuando el estado es blocked"),
  priority: z.enum(ACTIVITY_PRIORITIES).nullable().optional(),
});

export const completeTaskInputSchema = z.object({
  taskId: z.string().min(1).describe("Id de la tarea (de list_tasks)"),
});

type UpdateTaskArgs = z.output<typeof updateTaskInputSchema>;

export function buildActivityWriteTools(
  ctx: AgentToolContext,
  deps: WriteToolDeps = defaultWriteToolDeps,
) {
  const base: WriteBase = {
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    createdVia: "agent",
    metadata: { via: "agent" },
  };

  async function runTaskUpdate(args: UpdateTaskArgs) {
    const task = await ctx.db.activity.findUnique({
      where: { id: args.taskId },
      select: {
        id: true,
        companyId: true,
        opportunityId: true,
        occurredAt: true,
        type: true,
        status: true,
        plannedDate: true,
        dueDate: true,
        assigneeId: true,
        completedById: true,
        title: true,
        description: true,
        blockedReason: true,
        priority: true,
      },
    });
    // Las actividades registradas (ya ocurridas) no son tareas editables.
    if (!task || task.occurredAt) {
      throw new Error(`Tarea no encontrada: ${args.taskId}`);
    }

    const input: TaskUpdateInput = {};
    if (args.type !== undefined) input.type = args.type;
    if (args.status) input.status = toActivityStatus(args.status);
    if (args.plannedDate !== undefined) {
      input.plannedDate =
        args.plannedDate === null ? null : new Date(args.plannedDate);
    }
    if (args.dueDate !== undefined) {
      input.dueDate = args.dueDate === null ? null : new Date(args.dueDate);
    }
    if (args.assigneeId === null) {
      input.assigneeId = null;
    } else if (args.assigneeId || args.assigneeEmail) {
      const assignee = await resolveAssignee(ctx.db, {
        assigneeId: args.assigneeId ?? undefined,
        assigneeEmail: args.assigneeEmail,
      });
      input.assigneeId = assignee?.id ?? null;
    }
    if (args.completedById === null) {
      input.completedById = null;
    } else if (args.completedById || args.completedByEmail) {
      const completedBy = await resolveAssignee(ctx.db, {
        assigneeId: args.completedById ?? undefined,
        assigneeEmail: args.completedByEmail,
      });
      input.completedById = completedBy?.id ?? null;
    }
    if (args.title !== undefined) input.title = args.title;
    if (args.description !== undefined) {
      input.description = emptyToNull(args.description);
    }
    if (args.blockedReason !== undefined) {
      input.blockedReason = emptyToNull(args.blockedReason);
    }
    if (args.priority !== undefined) input.priority = args.priority;

    if (Object.keys(input).length === 0) {
      throw new Error(
        "Indicá al menos un campo para cambiar: type, status, plannedDate, dueDate, assignee, completedBy, title, description, blockedReason o priority.",
      );
    }

    const changes = diffTaskUpdate(task, input);
    // Pedir lo que ya está (p. ej. completar una tarea hecha) no es un
    // cambio: no consume el "único cambio del turno" ni genera propuesta.
    if (Object.keys(changes).length === 0) {
      return { status: "unchanged" as const, taskId: task.id };
    }

    const summaryParts: string[] = [];
    if (changes.status) {
      summaryParts.push(
        `${statusLabel(task.status)} → ${statusLabel(changes.status)}`,
      );
    }
    if (changes.dueDate !== undefined) {
      summaryParts.push(
        changes.dueDate
          ? `vence ${changes.dueDate.toISOString().slice(0, 10)}`
          : "sin vencimiento",
      );
    }
    if (changes.plannedDate !== undefined) {
      summaryParts.push(
        changes.plannedDate
          ? `planificada ${changes.plannedDate.toISOString().slice(0, 10)}`
          : "sin fecha planificada",
      );
    }
    if (changes.assigneeId !== undefined) {
      summaryParts.push(
        changes.assigneeId ? "nuevo responsable" : "sin responsable",
      );
    }
    if (changes.completedById !== undefined) {
      summaryParts.push(
        changes.completedById ? "quién la completó" : "sin autor de cierre",
      );
    }
    if (changes.priority !== undefined) {
      summaryParts.push(`prioridad ${changes.priority ?? "—"}`);
    }
    if (changes.title !== undefined)
      summaryParts.push(`título "${changes.title}"`);
    if (changes.description !== undefined) summaryParts.push("descripción");
    if (changes.blockedReason !== undefined)
      summaryParts.push("motivo de bloqueo");
    if (changes.type !== undefined) summaryParts.push(`tipo ${changes.type}`);

    const item: AgentProposalItemInput = {
      type: "update_task",
      entity: "activity",
      entityId: task.id,
      beforeValue: {
        type: task.type,
        status: task.status,
        plannedDate: task.plannedDate?.toISOString() ?? null,
        dueDate: task.dueDate?.toISOString() ?? null,
        assigneeId: task.assigneeId,
        completedById: task.completedById,
        title: task.title,
        description: task.description,
        blockedReason: task.blockedReason,
        priority: task.priority,
      },
      afterValue: taskUpdateToJson(task.id, changes),
      explanation: "Tarea actualizada por el copiloto desde el chat.",
      confidence: 1,
      evidence: null,
      label: `Tarea: ${task.title}`,
      before: statusLabel(task.status),
      after: summaryParts.join(" · "),
    };

    if (ctx.turnState.changeCount === 0) {
      ctx.turnState.changeCount += 1;
      const result = await deps.transaction(ctx.organizationId, (tx) =>
        applyTaskUpdate(tx, base, task.id, changes),
      );
      ctx.turnState.pendingInstant = {
        kind: "task_update",
        entityId: task.id,
        companyId: task.companyId ?? "",
        opportunityId: task.opportunityId,
        item,
        undo: (tx) => revertTaskUpdate(tx, ctx.organizationId, result),
      };
      if (result.statusChange) {
        await deps.evaluateWorkflows(ctx.db, ctx.organizationId, {
          entityType: "activity",
          entityId: task.id,
          eventName: "status_changed",
          actorId: ctx.userId,
          before: { status: result.statusChange.from },
          after: { status: result.statusChange.to },
        });
      }
      return {
        status: "updated" as const,
        taskId: task.id,
        changedFields: result.changedFields,
      };
    }

    return registerProposalChange(
      ctx,
      { companyId: task.companyId, opportunityId: task.opportunityId },
      [item],
    );
  }

  return {
    create_activity: defineAgentTool({
      description: `Registra una actividad comercial que YA ocurrió (reunión, llamada, email, visita u otra) en una empresa, opcionalmente ligada a una oportunidad y a personas. Actualiza el "último contacto" de la empresa y aparece en get_record_timeline y en recentActivities de get_company_snapshot. Para algo futuro usá create_task; para una reunión con resumen estructurado (puntos clave, decisiones, riesgos) usá create_meeting. ${INSTANT_RULE} ${ID_RULE}`,
      inputSchema: createActivityInputSchema,
      execute: async (args) => {
        const occurredAt = new Date(args.date);
        if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
          throw new Error(
            "La fecha es futura: create_activity registra lo que ya ocurrió. Para algo pendiente usá create_task.",
          );
        }
        await assertCompany(ctx.db, args.companyId);
        const opportunityId = emptyToNull(args.opportunityId);
        if (opportunityId) {
          await assertOpportunityOfCompany(
            ctx.db,
            opportunityId,
            args.companyId,
          );
        }
        const personIds = await assertPeople(ctx.db, args.personIds ?? []);

        const input: LoggedActivityInput = {
          companyId: args.companyId,
          opportunityId,
          personIds,
          type: args.type,
          title: args.title,
          occurredAt,
          durationMinutes: args.durationMinutes ?? null,
          channel: emptyToNull(args.channel),
          summary: emptyToNull(args.summary),
          outcomes: emptyToNull(args.outcomes),
        };
        const typeLabel = activityTypeLabel(args.type);
        const item: AgentProposalItemInput = {
          type: "log_activity",
          entity: "activity",
          entityId: null,
          beforeValue: null,
          afterValue: loggedActivityToJson(input),
          explanation: "Actividad registrada por el copiloto desde el chat.",
          confidence: 1,
          evidence: null,
          label: `${typeLabel}: ${args.title}`,
          before: "—",
          after: preview(
            [
              occurredAt.toISOString().slice(0, 10),
              input.channel,
              input.summary,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        };

        if (ctx.turnState.changeCount === 0) {
          ctx.turnState.changeCount += 1;
          const revert = await deps.transaction(ctx.organizationId, (tx) =>
            insertLoggedActivity(tx, base, input),
          );
          ctx.turnState.pendingInstant = {
            kind: "activity",
            entityId: revert.activityId,
            companyId: args.companyId,
            opportunityId,
            item,
            undo: (tx) => revertLoggedActivity(tx, ctx.organizationId, revert),
          };
          return {
            status: "created" as const,
            activityId: revert.activityId,
            lastContactUpdated: revert.lastContactUpdated,
          };
        }

        return registerProposalChange(
          ctx,
          { companyId: args.companyId, opportunityId },
          [item],
        );
      },
    }),

    create_meeting: defineAgentTool({
      description: `Crea un registro de reunión que no viene de una grabación (sin transcripción), con participantes y resumen cargados a mano: queda lista (processingStatus "ready") y aparece en list_meetings y get_meeting. No crea tareas a partir de nextSteps: si hay compromisos con fecha, crealos aparte con create_task. ${INSTANT_RULE} ${ID_RULE}`,
      inputSchema: createMeetingInputSchema,
      execute: async (args) => {
        await assertCompany(ctx.db, args.companyId);
        const opportunityId = emptyToNull(args.opportunityId);
        if (opportunityId) {
          await assertOpportunityOfCompany(
            ctx.db,
            opportunityId,
            args.companyId,
          );
        }

        const input: ManualMeetingInput = {
          companyId: args.companyId,
          opportunityId,
          title: args.title,
          meetingType: emptyToNull(args.meetingType) ?? "discovery",
          meetingDate: new Date(args.date),
          participants: args.participants ?? [],
          summary: emptyToNull(args.summary),
          keyPoints: args.keyPoints ?? [],
          decisions: args.decisions ?? [],
          risks: args.risks ?? [],
          nextSteps: args.nextSteps ?? [],
        };
        const item: AgentProposalItemInput = {
          type: "create_meeting",
          entity: "meeting",
          entityId: null,
          beforeValue: null,
          afterValue: manualMeetingToJson(input),
          explanation: "Reunión registrada por el copiloto desde el chat.",
          confidence: 1,
          evidence: null,
          label: `Reunión: ${args.title}`,
          before: "—",
          after: preview(
            [
              input.meetingDate.toISOString().slice(0, 10),
              input.meetingType,
              input.summary,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        };

        if (ctx.turnState.changeCount === 0) {
          ctx.turnState.changeCount += 1;
          const revert = await deps.transaction(ctx.organizationId, (tx) =>
            insertManualMeeting(tx, base, input),
          );
          ctx.turnState.pendingInstant = {
            kind: "meeting",
            entityId: revert.meetingId,
            companyId: args.companyId,
            opportunityId,
            item,
            undo: (tx) => revertManualMeeting(tx, ctx.organizationId, revert),
          };
          return { status: "created" as const, meetingId: revert.meetingId };
        }

        return registerProposalChange(
          ctx,
          { companyId: args.companyId, opportunityId },
          [item],
        );
      },
    }),

    update_task: defineAgentTool({
      description: `Modifica una tarea existente por taskId: tipo, estado (pending, in_progress, blocked, done), fecha planificada, vencimiento, responsable, quién la completó, título, descripción, motivo de bloqueo o prioridad. Solo se cambian los campos enviados. No existe el estado "cancelled". Los responsables son miembros del equipo interno. ${INSTANT_RULE} Resolvé taskId con list_tasks y el resto de ids con search_crm; nunca inventes un id.`,
      inputSchema: updateTaskInputSchema,
      execute: runTaskUpdate,
    }),

    complete_task: defineAgentTool({
      description: `Marca una tarea como hecha (status done). Atajo de update_task. ${INSTANT_RULE} Resolvé taskId con list_tasks; nunca inventes un id.`,
      inputSchema: completeTaskInputSchema,
      execute: ({ taskId }) => runTaskUpdate({ taskId, status: "done" }),
    }),
  };
}
