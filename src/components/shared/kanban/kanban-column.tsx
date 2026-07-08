"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  KanbanCard,
  type KanbanOpportunity,
} from "@/components/shared/kanban/kanban-card";
import { formatCurrencyValue } from "@/lib/format";

export function KanbanColumn({
  stageId,
  label,
  opportunities,
  currency,
  locale,
}: {
  stageId: string;
  label: string;
  opportunities: KanbanOpportunity[];
  currency: string;
  locale: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  const totalValue = opportunities.reduce(
    (total, opportunity) => total + (opportunity.estimatedValue ?? 0),
    0,
  );

  return (
    <div
      ref={setNodeRef}
      className={`bg-muted/15 flex min-h-48 min-w-0 flex-col gap-3 rounded-md border p-3 transition-colors ${
        isOver ? "border-primary/50 bg-muted/50 ring-primary/10 ring-2" : ""
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
        <div className="bg-background shrink-0 rounded-md border px-2 py-1 text-right">
          <p className="text-muted-foreground text-[0.65rem] leading-none">
            Valor
          </p>
          <p className="mt-1 text-xs font-semibold">
            {formatCurrencyValue(totalValue, currency, locale)}
          </p>
        </div>
      </div>

      <div className="flex min-h-20 flex-1 flex-col gap-2">
        {opportunities.map((opportunity) => (
          <KanbanCard
            key={opportunity.id}
            opportunity={opportunity}
            currency={currency}
            locale={locale}
          />
        ))}
        {opportunities.length === 0 && (
          <div className="text-muted-foreground bg-background/70 flex flex-1 items-center justify-center rounded-md border border-dashed p-4 text-center text-xs">
            Suelta una oportunidad acá para moverla a esta etapa.
          </div>
        )}
      </div>
    </div>
  );
}
