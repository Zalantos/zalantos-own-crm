import { tool } from "ai";
import { z } from "zod";
import { TYPE_LABELS } from "@/lib/timeline";
import type { AgentToolContext } from "@/lib/agent/executor";

const SUMMARY_MAX_CHARS = 200;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildTimelineTools(ctx: AgentToolContext) {
  const db = ctx.db;
  return {
    get_record_timeline: tool({
      description:
        "Devuelve la historia reciente de una empresa u oportunidad: notas, tareas, reuniones, cambios de etapa y demás eventos, del más nuevo al más viejo.",
      inputSchema: z.object({
        entity: z.enum(["company", "opportunity"]),
        id: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional().describe("Cantidad de eventos (default 20)"),
        types: z
          .array(z.string())
          .optional()
          .describe(
            "Filtrar por tipos de evento: note_added, task_created, stage_changed, meeting_created, proposal_applied, field_updated...",
          ),
      }),
      execute: async ({ entity, id, limit, types }) => {
        const take = limit ?? 20;

        // Distinguir "registro inexistente" de "registro sin historia".
        let name: string;
        if (entity === "company") {
          const company = await db.company.findUnique({
            where: { id },
            select: { name: true },
          });
          if (!company) return { error: `Empresa no encontrada: ${id}` };
          name = company.name;
        } else {
          const opportunity = await db.opportunity.findUnique({
            where: { id },
            select: { name: true },
          });
          if (!opportunity) return { error: `Oportunidad no encontrada: ${id}` };
          name = opportunity.name;
        }

        const events = await db.timelineEvent.findMany({
          where: {
            ...(entity === "company" ? { companyId: id } : { opportunityId: id }),
            ...(types && types.length > 0 ? { type: { in: types } } : {}),
          },
          orderBy: { occurredAt: "desc" },
          take: take + 1,
          select: {
            type: true,
            title: true,
            summary: true,
            occurredAt: true,
            actorId: true,
          },
        });
        const hasMore = events.length > take;
        const page = events.slice(0, take);

        // actorId no tiene FK a User: se resuelve en un lookup batcheado
        // aparte (mismo criterio que attachActors en @/lib/timeline).
        const actorIds = [
          ...new Set(page.map((event) => event.actorId).filter((actorId) => actorId !== null)),
        ];
        const actors = actorIds.length
          ? await db.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, name: true },
            })
          : [];
        const actorsById = new Map(actors.map((actor) => [actor.id, actor.name]));

        return {
          entity,
          id,
          name,
          events: page.map((event) => ({
            type: event.type,
            label: TYPE_LABELS[event.type] ?? event.type,
            title: event.title,
            summary: event.summary ? truncate(event.summary, SUMMARY_MAX_CHARS) : null,
            actor: event.actorId ? (actorsById.get(event.actorId) ?? null) : null,
            occurredAt: event.occurredAt.toISOString(),
          })),
          hasMore,
        };
      },
    }),
  };
}
