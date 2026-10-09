import { defineAgentTool } from "@/lib/agent/tool-definition";
import { z } from "zod";
import { appendTimelineEvent } from "@/lib/timeline";
import type { AgentToolContext } from "@/lib/agent/executor";
import {
  registerProposalChange,
  type AgentProposalItemInput,
} from "@/lib/agent/proposals";
import { ACTIVITY_PRIORITIES } from "@/lib/activity-priority";
import { ACTIVITY_STATUSES } from "@/lib/activity-status";
import { ACTIVITY_TYPES } from "@/lib/activity-types";
import {
  defaultWriteToolDeps,
  resolveAssignee,
  type WriteToolDeps,
} from "./record-lookup";

const emptyToNull = (value: string | undefined | null) =>
  value && value.trim() !== "" ? value : null;

// Low-risk writes ("auto" en la política de riesgo): se aplican al instante
// SOLO si son el único cambio del turno. Si el turno ya trae otro cambio (u
// otra nota/tarea aparece después), quedan como ítem de una CRMChangeProposal
// junto con el resto — ver registerProposalChange en proposals.ts.
export function buildWriteSafeTools(
  ctx: AgentToolContext,
  deps: WriteToolDeps = defaultWriteToolDeps,
) {
  // La empresa destino debe existir dentro de la org (una id ajena es
  // invisible para el cliente scoped).
  async function assertCompanyInOrg(companyId: string) {
    const company = await ctx.db.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new Error(`Empresa no encontrada: ${companyId}`);
    }
  }

  return {
    create_note: defineAgentTool({
      description:
        "Crea una nota en el CRM asociada a una empresa (y opcionalmente a una oportunidad o persona). Se aplica al instante SI es el único cambio del turno; si hay otro cambio en el mismo turno, queda junto a él en una propuesta para revisar.",
      inputSchema: z.object({
        companyId: z.string().min(1),
        opportunityId: z.string().optional(),
        personId: z.string().optional(),
        title: z.string().optional(),
        body: z.string().min(1).describe("Contenido de la nota"),
      }),
      execute: async ({ companyId, opportunityId, personId, title, body }) => {
        await assertCompanyInOrg(companyId);
        const opportunityIdOrNull = emptyToNull(opportunityId);
        const personIdOrNull = emptyToNull(personId);
        const titleOrNull = emptyToNull(title);

        const item: AgentProposalItemInput = {
          type: "add_note",
          entity: "note",
          entityId: null,
          beforeValue: null,
          afterValue: { title: titleOrNull, body, personId: personIdOrNull },
          explanation: "Nota creada por el copiloto desde el chat.",
          confidence: 1,
          evidence: null,
          label: titleOrNull ? `Nota: ${titleOrNull}` : "Nota",
          before: "—",
          after: body.length > 200 ? `${body.slice(0, 200)}…` : body,
        };

        if (ctx.turnState.changeCount === 0) {
          ctx.turnState.changeCount += 1;
          const note = await deps.transaction(
            ctx.organizationId,
            async (tx) => {
              const created = await tx.note.create({
                data: {
                  organizationId: ctx.organizationId,
                  companyId,
                  opportunityId: opportunityIdOrNull,
                  personId: personIdOrNull,
                  title: titleOrNull,
                  body,
                  createdById: ctx.userId,
                  createdVia: "agent",
                },
              });
              await appendTimelineEvent(tx, {
                organizationId: ctx.organizationId,
                companyId,
                opportunityId: opportunityIdOrNull,
                type: "note_added",
                title: created.title
                  ? `Nota: ${created.title}`
                  : "Nota agregada",
                summary: body.length > 200 ? `${body.slice(0, 200)}…` : body,
                refType: "agent_chat",
                refId: ctx.threadId,
                actorId: ctx.userId,
                metadata: { via: "agent" },
              });
              return created;
            },
          );
          ctx.turnState.pendingInstant = {
            kind: "note",
            entityId: note.id,
            companyId,
            opportunityId: opportunityIdOrNull,
            item,
          };
          return { status: "created", noteId: note.id };
        }

        return registerProposalChange(
          ctx,
          { companyId, opportunityId: opportunityIdOrNull },
          [item],
        );
      },
    }),

    create_task: defineAgentTool({
      description:
        "Crea una tarea asociada a una empresa (y opcionalmente a una oportunidad o persona) con tipo, estado, fechas planificada/límite, responsable, autor de cierre, bloqueo y prioridad. Se aplica al instante SI es el único cambio del turno; si hay otro cambio en el mismo turno, queda junto a él en una propuesta para revisar.",
      inputSchema: z.object({
        companyId: z.string().min(1),
        opportunityId: z.string().optional(),
        personId: z.string().optional(),
        type: z.enum(ACTIVITY_TYPES).optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        plannedDate: z.string().optional(),
        dueDate: z
          .string()
          .optional()
          .describe("Fecha de vencimiento en formato ISO (YYYY-MM-DD)"),
        assigneeId: z
          .string()
          .optional()
          .describe("Id del miembro del equipo responsable (o de su usuario)"),
        assigneeEmail: z
          .string()
          .optional()
          .describe(
            "Email del miembro del equipo responsable (alternativa a assigneeId)",
          ),
        completedById: z.string().optional(),
        completedByEmail: z.string().optional(),
        status: z.enum(ACTIVITY_STATUSES).optional(),
        blockedReason: z.string().optional(),
        priority: z.enum(ACTIVITY_PRIORITIES).optional(),
      }),
      execute: async ({
        companyId,
        opportunityId,
        personId,
        type,
        title,
        description,
        plannedDate,
        dueDate,
        assigneeId,
        assigneeEmail,
        completedById,
        completedByEmail,
        status,
        blockedReason,
        priority,
      }) => {
        const planned = plannedDate ? new Date(plannedDate) : null;
        if (planned && Number.isNaN(planned.getTime())) {
          return {
            error: `plannedDate inválida: ${plannedDate}. Usar formato ISO.`,
          };
        }
        const due = dueDate ? new Date(dueDate) : null;
        if (due && Number.isNaN(due.getTime())) {
          return { error: `dueDate inválida: ${dueDate}. Usar formato ISO.` };
        }
        await assertCompanyInOrg(companyId);
        const assignee = await resolveAssignee(ctx.db, {
          assigneeId,
          assigneeEmail,
        });
        const completedBy = await resolveAssignee(ctx.db, {
          assigneeId: completedById,
          assigneeEmail: completedByEmail,
        });
        const taskStatus = status ?? "todo";
        if (blockedReason && taskStatus !== "blocked") {
          return {
            error: "blockedReason solo se puede guardar con status blocked.",
          };
        }
        const opportunityIdOrNull = emptyToNull(opportunityId);
        const personIdOrNull = emptyToNull(personId);
        const descriptionOrNull = emptyToNull(description);

        const item: AgentProposalItemInput = {
          type: "create_task",
          entity: "activity",
          entityId: null,
          beforeValue: null,
          afterValue: {
            activityType: type ?? "task",
            title,
            description: descriptionOrNull,
            plannedDate: plannedDate ?? null,
            dueDate: dueDate ?? null,
            personId: personIdOrNull,
            status: taskStatus,
            blockedReason: emptyToNull(blockedReason),
            // Solo cuando vienen, para no cambiar el ítem de siempre.
            ...(assignee ? { assigneeId: assignee.id } : {}),
            ...(completedBy ? { completedById: completedBy.id } : {}),
            ...(priority ? { priority } : {}),
          },
          explanation: "Tarea creada por el copiloto desde el chat.",
          confidence: 1,
          evidence: null,
          label: `Tarea: ${title}`,
          before: "—",
          after: [
            due ? `${title} (vence ${dueDate})` : title,
            assignee ? `responsable ${assignee.name}` : null,
            priority ? `prioridad ${priority}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        };

        if (ctx.turnState.changeCount === 0) {
          ctx.turnState.changeCount += 1;
          const task = await deps.transaction(
            ctx.organizationId,
            async (tx) => {
              const created = await tx.activity.create({
                data: {
                  organizationId: ctx.organizationId,
                  companyId,
                  opportunityId: opportunityIdOrNull,
                  personId: personIdOrNull,
                  type: type ?? "task",
                  title,
                  description: descriptionOrNull,
                  plannedDate: planned,
                  dueDate: due,
                  assigneeId: assignee?.id ?? null,
                  completedById:
                    completedBy?.id ??
                    (taskStatus === "done" ? (assignee?.id ?? null) : null),
                  completedAt: taskStatus === "done" ? new Date() : null,
                  statusChangedAt: status ? new Date() : null,
                  blockedReason:
                    taskStatus === "blocked"
                      ? emptyToNull(blockedReason)
                      : null,
                  priority: priority ?? null,
                  status: taskStatus,
                  createdById: ctx.userId,
                  createdVia: "agent",
                },
              });
              await appendTimelineEvent(tx, {
                organizationId: ctx.organizationId,
                companyId,
                opportunityId: opportunityIdOrNull,
                type: "task_created",
                title: `Tarea creada: ${title}`,
                summary: due
                  ? `Vence ${due.toLocaleDateString("es-AR")}`
                  : null,
                refType: "agent_chat",
                refId: ctx.threadId,
                actorId: ctx.userId,
                metadata: { via: "agent" },
              });
              return created;
            },
          );
          ctx.turnState.pendingInstant = {
            kind: "task",
            entityId: task.id,
            companyId,
            opportunityId: opportunityIdOrNull,
            item,
          };
          return { status: "created", taskId: task.id };
        }

        return registerProposalChange(
          ctx,
          { companyId, opportunityId: opportunityIdOrNull },
          [item],
        );
      },
    }),
  };
}
