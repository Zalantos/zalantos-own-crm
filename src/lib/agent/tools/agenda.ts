import { tool } from "ai";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { extractHeadline } from "./meetings";
import type { AgentToolContext } from "@/lib/agent/executor";

const taskSelect = {
  id: true,
  title: true,
  dueDate: true,
  company: { select: { name: true } },
  opportunity: { select: { name: true } },
} satisfies Prisma.ActivitySelect;

type TaskRow = Prisma.ActivityGetPayload<{ select: typeof taskSelect }>;

function formatTask(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    companyName: task.company?.name ?? null,
    opportunityName: task.opportunity?.name ?? null,
  };
}

export function buildAgendaTools(ctx: AgentToolContext) {
  const db = ctx.db;
  return {
    get_my_agenda: tool({
      description:
        "Arma la agenda del usuario actual: tareas vencidas y próximas, oportunidades que cierran pronto y sus reuniones recientes y próximas. Usala cuando pregunte por sus pendientes o qué tiene que hacer.",
      inputSchema: z.object({
        horizonDays: z
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .describe("Ventana en días hacia adelante y atrás (default 7)"),
      }),
      execute: async ({ horizonDays }) => {
        const horizon = horizonDays ?? 7;
        const now = new Date();
        const until = new Date(now.getTime() + horizon * 86_400_000);
        const since = new Date(now.getTime() - horizon * 86_400_000);

        // Las tareas se asignan a TeamMember; si el usuario no está vinculado
        // como miembro, caemos a las tareas que él creó.
        const teamMember = await db.teamMember.findFirst({
          where: { userId: ctx.userId },
          select: { id: true },
        });
        const taskFilter = teamMember
          ? { assigneeId: teamMember.id }
          : { createdById: ctx.userId };
        const pendingTaskWhere = { type: "task", status: "pending", ...taskFilter };

        const [
          overdueTasks,
          upcomingTasks,
          undatedPendingCount,
          closingOpportunities,
          recentMeetings,
          upcomingMeetings,
        ] = await Promise.all([
          db.activity.findMany({
            where: { ...pendingTaskWhere, dueDate: { lt: now } },
            orderBy: { dueDate: "asc" },
            take: 15,
            select: taskSelect,
          }),
          db.activity.findMany({
            where: { ...pendingTaskWhere, dueDate: { gte: now, lte: until } },
            orderBy: { dueDate: "asc" },
            take: 15,
            select: taskSelect,
          }),
          db.activity.count({ where: { ...pendingTaskWhere, dueDate: null } }),
          db.opportunity.findMany({
            where: { status: "open", expectedCloseDate: { gte: now, lte: until } },
            orderBy: { expectedCloseDate: "asc" },
            take: 10,
            select: {
              id: true,
              name: true,
              estimatedValue: true,
              expectedCloseDate: true,
              createdById: true,
              stage: { select: { label: true } },
              company: { select: { name: true } },
            },
          }),
          db.meeting.findMany({
            where: {
              createdBy: ctx.userId,
              meetingDate: { gte: since, lt: now },
              processingStatus: "ready",
            },
            orderBy: { meetingDate: "desc" },
            take: 5,
            select: { id: true, title: true, meetingDate: true, aiSummary: true },
          }),
          db.meeting.findMany({
            where: { createdBy: ctx.userId, meetingDate: { gte: now, lte: until } },
            orderBy: { meetingDate: "asc" },
            take: 5,
            select: { id: true, title: true, meetingDate: true },
          }),
        ]);

        return {
          horizonDays: horizon,
          // false = el usuario no está vinculado a un TeamMember; se muestran
          // las tareas creadas por él y conviene aclarárselo.
          assigneeResolved: teamMember !== null,
          overdueTasks: overdueTasks.map(formatTask),
          upcomingTasks: upcomingTasks.map(formatTask),
          undatedPendingCount,
          // Sin owner en Opportunity, las que cierran pronto son de toda la
          // org; isMine marca las creadas por el usuario.
          closingOpportunities: closingOpportunities.map((opportunity) => ({
            id: opportunity.id,
            name: opportunity.name,
            companyName: opportunity.company.name,
            stageLabel: opportunity.stage.label,
            estimatedValue: opportunity.estimatedValue?.toString() ?? null,
            expectedCloseDate:
              opportunity.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
            isMine: opportunity.createdById === ctx.userId,
          })),
          recentMeetings: recentMeetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            date: meeting.meetingDate.toISOString(),
            headline: extractHeadline(meeting.aiSummary),
          })),
          upcomingMeetings: upcomingMeetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            date: meeting.meetingDate.toISOString(),
          })),
        };
      },
    }),
  };
}
