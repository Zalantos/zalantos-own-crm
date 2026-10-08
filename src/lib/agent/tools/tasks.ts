import { defineAgentTool } from "@/lib/agent/tool-definition";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AgentToolContext } from "@/lib/agent/executor";
import {
  ACTIVITY_OPEN_STATUSES,
  isActivityStatus,
} from "@/lib/activity-status";
import { ACTIVITY_PRIORITIES } from "@/lib/activity-priority";
import { isoDateString, resolveAssignee } from "./record-lookup";
import { TASK_STATUS_INPUTS, toActivityStatus } from "./write-activity";

export const listTasksInputSchema = z.object({
  companyId: z.string().optional(),
  opportunityId: z.string().optional(),
  assigneeId: z
    .string()
    .optional()
    .describe(
      'Id del miembro del equipo (o de su usuario). "me" = el usuario actual; "none" = sin responsable.',
    ),
  assigneeEmail: z
    .string()
    .optional()
    .describe("Email del miembro del equipo responsable"),
  status: z
    .array(z.enum([...TASK_STATUS_INPUTS, "open"]))
    .optional()
    .describe(
      'Estados a incluir. "open" = pending + in_progress + blocked. Default: ["open"].',
    ),
  priority: z.array(z.enum(ACTIVITY_PRIORITIES)).optional(),
  overdue: z
    .boolean()
    .optional()
    .describe("true = solo tareas abiertas con vencimiento pasado"),
  dueBefore: isoDateString(
    "Vencimiento anterior o igual a esta fecha ISO",
  ).optional(),
  dueAfter: isoDateString(
    "Vencimiento posterior o igual a esta fecha ISO",
  ).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Cantidad de tareas (default 20)"),
});

function isOpenStatus(status: string): boolean {
  return isActivityStatus(status) && ACTIVITY_OPEN_STATUSES.includes(status);
}

export function buildTaskTools(ctx: AgentToolContext) {
  const db = ctx.db;
  return {
    list_tasks: defineAgentTool({
      description:
        "Lista tareas del CRM filtrando por empresa, oportunidad, responsable, estado, prioridad y vencimiento. Devuelve taskId para usar con update_task/complete_task. Por defecto trae solo tareas abiertas, ordenadas por vencimiento. No incluye actividades ya registradas con create_activity. Resolvé ids con search_crm; nunca inventes un id.",
      inputSchema: listTasksInputSchema,
      execute: async (args) => {
        const take = args.limit ?? 20;
        const now = new Date();

        let assigneeWhere: Prisma.ActivityWhereInput = {};
        if (args.assigneeId === "none") {
          assigneeWhere = { assigneeId: null };
        } else if (args.assigneeId === "me") {
          assigneeWhere = { assignee: { userId: ctx.userId } };
        } else if (args.assigneeId || args.assigneeEmail) {
          const assignee = await resolveAssignee(db, {
            assigneeId: args.assigneeId,
            assigneeEmail: args.assigneeEmail,
          });
          assigneeWhere = { assigneeId: assignee?.id ?? null };
        }

        const requested = args.status ?? ["open"];
        const statuses = [
          ...new Set(
            requested.flatMap((status) =>
              status === "open"
                ? ACTIVITY_OPEN_STATUSES
                : [toActivityStatus(status)],
            ),
          ),
        ];

        const dueDate: Prisma.DateTimeNullableFilter = {};
        if (args.dueBefore) dueDate.lte = new Date(args.dueBefore);
        if (args.dueAfter) dueDate.gte = new Date(args.dueAfter);
        if (args.overdue) dueDate.lt = now;

        const where: Prisma.ActivityWhereInput = {
          // Las actividades registradas no son tareas.
          occurredAt: null,
          ...(args.companyId ? { companyId: args.companyId } : {}),
          ...(args.opportunityId ? { opportunityId: args.opportunityId } : {}),
          ...assigneeWhere,
          status: {
            in: args.overdue ? statuses.filter(isOpenStatus) : statuses,
          },
          ...(args.priority?.length ? { priority: { in: args.priority } } : {}),
          ...(Object.keys(dueDate).length > 0 ? { dueDate } : {}),
        };

        const tasks = await db.activity.findMany({
          where,
          orderBy: [
            { dueDate: { sort: "asc", nulls: "last" } },
            { createdAt: "desc" },
          ],
          take: take + 1,
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            dueDate: true,
            completedAt: true,
            company: { select: { id: true, name: true } },
            opportunity: { select: { id: true, name: true } },
            person: { select: { id: true, firstName: true, lastName: true } },
            assignee: { select: { id: true, name: true, email: true } },
          },
        });
        const page = tasks.slice(0, take);

        return {
          tasks: page.map((task) => ({
            taskId: task.id,
            type: task.type,
            title: task.title,
            description: task.description,
            // "todo" se expone como "pending", igual que lo acepta update_task.
            status: task.status === "todo" ? "pending" : task.status,
            priority: task.priority,
            dueDate: task.dueDate?.toISOString() ?? null,
            overdue:
              task.dueDate !== null &&
              task.dueDate < now &&
              isOpenStatus(task.status),
            completedAt: task.completedAt?.toISOString() ?? null,
            company: task.company,
            opportunity: task.opportunity,
            person: task.person
              ? {
                  id: task.person.id,
                  name: `${task.person.firstName} ${task.person.lastName}`.trim(),
                }
              : null,
            assignee: task.assignee,
          })),
          hasMore: tasks.length > take,
        };
      },
    }),
  };
}
