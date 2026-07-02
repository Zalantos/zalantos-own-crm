"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  KanbanCard,
  type KanbanOpportunity,
} from "@/components/shared/kanban/kanban-card";
import type { OpportunityStage } from "@prisma/client";

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  currency: "CLP",
  maximumFractionDigits: 0,
  style: "currency",
});

export function KanbanColumn({
  stage,
  label,
  opportunities,
}: {
  stage: OpportunityStage;
  label: string;
  opportunities: KanbanOpportunity[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const totalValue = opportunities.reduce(
    (total, opportunity) => total + (opportunity.estimatedValue ?? 0),
    0,
  );

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-48 min-w-0 flex-col gap-3 rounded-md border bg-muted/15 p-3 transition-colors ${
        isOver ? "border-primary/50 bg-muted/50 ring-2 ring-primary/10" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label}</p>
          <p className="text-muted-foreground text-xs">
            {opportunities.length}{" "}
            {opportunities.length === 1 ? "oportunidad" : "oportunidades"}
          </p>
        </div>
        <div className="shrink-0 rounded-md border bg-background px-2 py-1 text-right">
          <p className="text-muted-foreground text-[0.65rem] leading-none">
            Valor
          </p>
          <p className="mt-1 text-xs font-semibold">
            {currencyFormatter.format(totalValue)}
          </p>
        </div>
      </div>

      <div className="flex min-h-20 flex-1 flex-col gap-2">
        {opportunities.map((opportunity) => (
          <KanbanCard key={opportunity.id} opportunity={opportunity} />
        ))}
        {opportunities.length === 0 && (
          <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed bg-background/70 p-4 text-center text-xs">
            Suelta una oportunidad acá para moverla a esta etapa.
          </div>
        )}
      </div>
    </div>
  );
}
