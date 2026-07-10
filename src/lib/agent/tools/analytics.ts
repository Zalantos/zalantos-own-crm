import { tool } from "ai";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getOrgStages, stagesById, stagesByKey } from "@/lib/pipeline/stages";
import type { StageOption } from "@/lib/pipeline/stages";
import type { AgentToolContext } from "@/lib/agent/executor";

// Cap del escaneo en memoria para el filtro de inactividad y el groupBy por
// mes: suficiente para volúmenes por tenant sin riesgo de respuestas enormes.
const IN_MEMORY_SCAN_CAP = 500;

const opportunityRowSelect = {
  id: true,
  name: true,
  status: true,
  estimatedValue: true,
  expectedCloseDate: true,
  createdAt: true,
  stage: { select: { id: true, key: true, label: true } },
  company: { select: { name: true } },
} satisfies Prisma.OpportunitySelect;

type OpportunityRow = Prisma.OpportunityGetPayload<{
  select: typeof opportunityRowSelect;
}>;

type GroupRow = { key: string; label: string; count: number; sum: string };

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

function parseDate(value: string | undefined, field: string) {
  if (!value) return { date: undefined };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: `Fecha inválida en ${field}: "${value}". Usá formato ISO YYYY-MM-DD.` };
  }
  return { date };
}

function sumValues(rows: OpportunityRow[]): string {
  return rows
    .reduce(
      (acc, row) => (row.estimatedValue ? acc.add(row.estimatedValue) : acc),
      new Prisma.Decimal(0),
    )
    .toString();
}

function formatItem(row: OpportunityRow, lastActivityAt?: Date) {
  return {
    id: row.id,
    name: row.name,
    companyName: row.company.name,
    stage: row.stage.key,
    stageLabel: row.stage.label,
    status: row.status,
    estimatedValue: row.estimatedValue?.toString() ?? null,
    expectedCloseDate: row.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
    ...(lastActivityAt
      ? { lastActivityAt: lastActivityAt.toISOString().slice(0, 10) }
      : {}),
  };
}

function groupRowsInMemory(
  rows: OpportunityRow[],
  groupBy: "stage" | "status" | "closeMonth",
): GroupRow[] {
  const buckets = new Map<string, { label: string; rows: OpportunityRow[] }>();
  for (const row of rows) {
    const [key, label] =
      groupBy === "stage"
        ? [row.stage.key, row.stage.label]
        : groupBy === "status"
          ? [row.status, row.status]
          : row.expectedCloseDate
            ? [row.expectedCloseDate.toISOString().slice(0, 7), row.expectedCloseDate.toISOString().slice(0, 7)]
            : ["sin_fecha", "Sin fecha de cierre"];
    const bucket = buckets.get(key) ?? { label, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      count: bucket.rows.length,
      sum: sumValues(bucket.rows),
    }))
    .sort((a, b) => b.count - a.count);
}

export function buildAnalyticsTools(ctx: AgentToolContext) {
  const db = ctx.db;
  return {
    query_opportunities: tool({
      description:
        "Consulta agregada de oportunidades: devuelve conteo, suma de valores y el top de registros según filtros (etapa, status, empresa, montos, fechas de cierre/creación). Usala para preguntas tipo cuánto hay en pipeline o cuántas oportunidades en una etapa. Enviá SOLO los filtros que el usuario pidió; omití el resto.",
      inputSchema: z.object({
        stage: z
          .string()
          .optional()
          .describe("Key de la etapa (p. ej. negociacion). Ver etapas válidas en list_writable_fields."),
        status: z.enum(["open", "won", "lost"]).optional(),
        companyId: z.string().optional(),
        minValue: z.number().optional().describe("Valor estimado mínimo"),
        maxValue: z.number().optional().describe("Valor estimado máximo"),
        closingAfter: z
          .string()
          .optional()
          .describe("ISO YYYY-MM-DD; incluye oportunidades con fecha de cierre esperada >= esta fecha"),
        closingBefore: z
          .string()
          .optional()
          .describe("ISO YYYY-MM-DD; incluye oportunidades con fecha de cierre esperada <= esta fecha"),
        createdAfter: z.string().optional().describe("ISO YYYY-MM-DD; creadas desde esta fecha"),
        createdBefore: z.string().optional().describe("ISO YYYY-MM-DD; creadas hasta esta fecha"),
        groupBy: z
          .enum(["stage", "status", "closeMonth"])
          .optional()
          .describe("Desglosar los agregados por etapa, status o mes de cierre"),
        limit: z.number().int().min(1).max(25).optional().describe("Cantidad de registros a listar (default 10)"),
      }),
      execute: async (rawInput) => {
        // Los modelos suelen rellenar los filtros opcionales con "" o 0:
        // se tratan como ausentes en vez de filtrar a resultados vacíos.
        const input = {
          ...rawInput,
          stage: emptyToUndefined(rawInput.stage),
          companyId: emptyToUndefined(rawInput.companyId),
          minValue: rawInput.minValue || undefined,
          maxValue: rawInput.maxValue || undefined,
        };
        const take = input.limit ?? 10;

        const closingAfter = parseDate(input.closingAfter, "closingAfter");
        const closingBefore = parseDate(input.closingBefore, "closingBefore");
        const createdAfter = parseDate(input.createdAfter, "createdAfter");
        const createdBefore = parseDate(input.createdBefore, "createdBefore");
        for (const parsed of [closingAfter, closingBefore, createdAfter, createdBefore]) {
          if (parsed.error) return { error: parsed.error };
        }

        let stage: StageOption | undefined;
        const stages = await getOrgStages(db);
        if (input.stage) {
          stage = stagesByKey(stages).get(input.stage);
          if (!stage) {
            return {
              error: `Etapa desconocida: "${input.stage}". Etapas válidas: ${stages.map((s) => s.key).join(", ")}`,
            };
          }
        }

        const where: Prisma.OpportunityWhereInput = {
          ...(stage ? { stageId: stage.id } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.companyId ? { companyId: input.companyId } : {}),
          ...(input.minValue !== undefined || input.maxValue !== undefined
            ? {
                estimatedValue: {
                  ...(input.minValue !== undefined ? { gte: input.minValue } : {}),
                  ...(input.maxValue !== undefined ? { lte: input.maxValue } : {}),
                },
              }
            : {}),
          ...(closingAfter.date || closingBefore.date
            ? {
                expectedCloseDate: {
                  ...(closingAfter.date ? { gte: closingAfter.date } : {}),
                  ...(closingBefore.date ? { lte: closingBefore.date } : {}),
                },
              }
            : {}),
          ...(createdAfter.date || createdBefore.date
            ? {
                createdAt: {
                  ...(createdAfter.date ? { gte: createdAfter.date } : {}),
                  ...(createdBefore.date ? { lte: createdBefore.date } : {}),
                },
              }
            : {}),
        };

        const [items, aggregate] = await Promise.all([
          db.opportunity.findMany({
            where,
            orderBy: { estimatedValue: { sort: "desc", nulls: "last" } },
            take,
            select: opportunityRowSelect,
          }),
          db.opportunity.aggregate({
            where,
            _count: true,
            _sum: { estimatedValue: true },
          }),
        ]);

        let groups: GroupRow[] | undefined;
        if (input.groupBy === "stage") {
          const grouped = await db.opportunity.groupBy({
            by: ["stageId"],
            where,
            _count: { _all: true },
            _sum: { estimatedValue: true },
          });
          const stageLookup = stagesById(stages);
          groups = grouped
            .map((group) => {
              const stageOption = stageLookup.get(group.stageId);
              return {
                key: stageOption?.key ?? group.stageId,
                label: stageOption?.label ?? group.stageId,
                count: group._count._all,
                sum: group._sum.estimatedValue?.toString() ?? "0",
              };
            })
            .sort((a, b) => b.count - a.count);
        } else if (input.groupBy === "status") {
          const grouped = await db.opportunity.groupBy({
            by: ["status"],
            where,
            _count: { _all: true },
            _sum: { estimatedValue: true },
          });
          groups = grouped
            .map((group) => ({
              key: group.status,
              label: group.status,
              count: group._count._all,
              sum: group._sum.estimatedValue?.toString() ?? "0",
            }))
            .sort((a, b) => b.count - a.count);
        } else if (input.groupBy === "closeMonth") {
          const rows = await db.opportunity.findMany({
            where,
            select: opportunityRowSelect,
            take: IN_MEMORY_SCAN_CAP,
          });
          groups = groupRowsInMemory(rows, "closeMonth");
        }

        return {
          count: aggregate._count,
          sumEstimatedValue: aggregate._sum.estimatedValue?.toString() ?? "0",
          ...(groups ? { groups } : {}),
          items: items.map((row) => formatItem(row)),
          truncated: aggregate._count > items.length,
        };
      },
    }),

    find_inactive_opportunities: tool({
      description:
        "Encuentra oportunidades abiertas sin actividad registrada en los últimos N días (deals estancados o sin seguimiento). Usala SOLO cuando pregunten por inactividad.",
      inputSchema: z.object({
        days: z.number().int().min(1).describe("Días sin actividad (p. ej. 30)"),
        limit: z.number().int().min(1).max(25).optional().describe("Cantidad de registros a listar (default 10)"),
      }),
      execute: async ({ days, limit }) => {
        const take = limit ?? 10;
        // La inactividad se mide por el último TimelineEvent (no por
        // updatedAt, que se mueve con cualquier edición administrativa y no
        // refleja notas/tareas vinculadas).
        const candidates = await db.opportunity.findMany({
          where: { status: "open" },
          select: opportunityRowSelect,
          take: IN_MEMORY_SCAN_CAP,
        });
        const lastEvents = candidates.length
          ? await db.timelineEvent.groupBy({
              by: ["opportunityId"],
              where: { opportunityId: { in: candidates.map((c) => c.id) } },
              _max: { occurredAt: true },
            })
          : [];
        const lastEventByOpportunity = new Map(
          lastEvents.map((event) => [event.opportunityId, event._max.occurredAt]),
        );
        const cutoff = new Date(Date.now() - days * 86_400_000);
        const inactive = candidates
          .map((row) => {
            const lastEvent = lastEventByOpportunity.get(row.id);
            const lastActivityAt =
              lastEvent && lastEvent > row.createdAt ? lastEvent : row.createdAt;
            return { row, lastActivityAt };
          })
          .filter(({ lastActivityAt }) => lastActivityAt < cutoff)
          .sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime());

        return {
          count: inactive.length,
          sumEstimatedValue: sumValues(inactive.map(({ row }) => row)),
          items: inactive
            .slice(0, take)
            .map(({ row, lastActivityAt }) => formatItem(row, lastActivityAt)),
          truncated: inactive.length > take,
        };
      },
    }),
  };
}
