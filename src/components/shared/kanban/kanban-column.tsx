"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  KanbanCard,
  type KanbanOpportunity,
} from "@/components/shared/kanban/kanban-card";
import type { OpportunityStage } from "@prisma/client";

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

  return (
    <div
      ref={setNodeRef}
      className={`bg-muted/20 flex w-64 shrink-0 flex-col gap-2 rounded-md border p-2 ${
        isOver ? "bg-muted/50" : ""
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium">{label}</p>
        <span className="text-muted-foreground text-xs">
          {opportunities.length}
        </span>
      </div>
      <div className="flex min-h-16 flex-col gap-2">
        {opportunities.map((opportunity) => (
          <KanbanCard key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>
    </div>
  );
}
