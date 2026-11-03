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
      className={`bg-muted/15 flex min-h-48 w-[17.5rem] shrink-0 flex-col gap-2 rounded-md border p-2.5 transition-colors sm:w-72 ${
        isOver ? "border-primary/50 bg-muted/50 ring-primary/10 ring-2" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <p className="truncate text-sm font-semibold">
          {label}{" "}
          <span className="text-muted-foreground font-normal">
            ({opportunities.length})
          </span>
        </p>
        <p className="text-muted-foreground shrink-0 text-xs">
          {formatCurrencyValue(totalValue, currency, locale)}
        </p>
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
            Arrastra una oportunidad a esta etapa.
          </div>
        )}
      </div>
    </div>
  );
}
