import { tool } from "ai";
import { z } from "zod";
import { withOrgTransaction } from "@/lib/tenant";
import { appendTimelineEvent } from "@/lib/timeline";
import type { AgentToolContext } from "@/lib/agent/executor";

const emptyToNull = (value: string | undefined | null) =>
  value && value.trim() !== "" ? value : null;

// Low-risk writes ("auto" in the risk policy): they execute immediately but
// always leave a TimelineEvent audit trail attributed to the acting user.
export function buildWriteSafeTools(ctx: AgentToolContext) {
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
    create_note: tool({
      description:
        "Crea una nota en el CRM asociada a una empresa (y opcionalmente a una oportunidad o persona). Se aplica al instante.",
      inputSchema: z.object({
        companyId: z.string().min(1),
        opportunityId: z.string().optional(),
        personId: z.string().optional(),
        title: z.string().optional(),
        body: z.string().min(1).describe("Contenido de la nota"),
      }),
      execute: async ({ companyId, opportunityId, personId, title, body }) => {
        await assertCompanyInOrg(companyId);
        const note = await withOrgTransaction(
          ctx.organizationId,
          async (tx) => {
            const created = await tx.note.create({
              data: {
                organizationId: ctx.organizationId,
                companyId,
                opportunityId: emptyToNull(opportunityId),
                personId: emptyToNull(personId),
                title: emptyToNull(title),
                body,
              },
            });
            await appendTimelineEvent(tx, {
              organizationId: ctx.organizationId,
              companyId,
              opportunityId: emptyToNull(opportunityId),
              type: "note_added",
              title: created.title ? `Nota: ${created.title}` : "Nota agregada",
              summary: body.length > 200 ? `${body.slice(0, 200)}…` : body,
              refType: "agent_chat",
              refId: ctx.threadId,
              actorId: ctx.userId,
              metadata: { via: "agent" },
            });
            return created;
          },
        );
        return { status: "created", noteId: note.id };
      },
    }),

    create_task: tool({
      description:
        "Crea una tarea pendiente asociada a una empresa (y opcionalmente a una oportunidad o persona). Se aplica al instante.",
      inputSchema: z.object({
        companyId: z.string().min(1),
        opportunityId: z.string().optional(),
        personId: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z
          .string()
          .optional()
          .describe("Fecha de vencimiento en formato ISO (YYYY-MM-DD)"),
      }),
      execute: async ({
        companyId,
        opportunityId,
        personId,
        title,
        description,
        dueDate,
      }) => {
        const due = dueDate ? new Date(dueDate) : null;
        if (due && Number.isNaN(due.getTime())) {
          return { error: `dueDate inválida: ${dueDate}. Usar formato ISO.` };
        }
        await assertCompanyInOrg(companyId);
        const task = await withOrgTransaction(
          ctx.organizationId,
          async (tx) => {
            const created = await tx.activity.create({
              data: {
                organizationId: ctx.organizationId,
                companyId,
                opportunityId: emptyToNull(opportunityId),
                personId: emptyToNull(personId),
                type: "task",
                title,
                description: emptyToNull(description),
                dueDate: due,
                status: "pending",
              },
            });
            await appendTimelineEvent(tx, {
              organizationId: ctx.organizationId,
              companyId,
              opportunityId: emptyToNull(opportunityId),
              type: "task_created",
              title: `Tarea creada: ${title}`,
              summary: due ? `Vence ${due.toLocaleDateString("es-AR")}` : null,
              refType: "agent_chat",
              refId: ctx.threadId,
              actorId: ctx.userId,
              metadata: { via: "agent" },
            });
            return created;
          },
        );
        return { status: "created", taskId: task.id };
      },
    }),
  };
}
