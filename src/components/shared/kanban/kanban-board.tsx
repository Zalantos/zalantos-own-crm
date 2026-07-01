"use client";

import { useState, useSyncExternalStore } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { KanbanColumn } from "@/components/shared/kanban/kanban-column";
import type { KanbanOpportunity } from "@/components/shared/kanban/kanban-card";
import { updateOpportunityStage } from "@/app/(dashboard)/opportunities/actions";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
} from "@/lib/zod/opportunity";
import type { OpportunityStage } from "@prisma/client";

function subscribeNoop() {
  return () => {};
}

// @dnd-kit generates accessibility ids from a module-level counter, which
// diverges between the server render and the client render and trips a
// hydration mismatch. useSyncExternalStore reports `false` for both the SSR
// pass and the first client render (keeping them identical for hydration),
// then flips to `true` right after, deferring the interactive board.
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function KanbanBoard({
  opportunities,
}: {
  opportunities: KanbanOpportunity[];
}) {
  const [items, setItems] = useState(opportunities);
  const mounted = useMounted();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const opportunityId = active.id as string;
    const newStage = over.id as OpportunityStage;
    const current = items.find((item) => item.id === opportunityId);
    if (!current || current.stage === newStage) return;

    const previousStage = current.stage;
    setItems((prev) =>
      prev.map((item) =>
        item.id === opportunityId ? { ...item, stage: newStage } : item,
      ),
    );

    updateOpportunityStage(opportunityId, newStage).catch(() => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === opportunityId ? { ...item, stage: previousStage } : item,
        ),
      );
      toast.error("No se pudo mover la oportunidad. Intenta de nuevo.");
    });
  }

  const columns = OPPORTUNITY_STAGES.map((stage) => ({
    stage,
    label: OPPORTUNITY_STAGE_LABELS[stage],
    opportunities: items.filter((item) => item.stage === stage),
  }));

  if (!mounted) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map(({ stage, label, opportunities: columnOpportunities }) => (
          <div
            key={stage}
            className="bg-muted/20 flex w-64 shrink-0 flex-col gap-2 rounded-md border p-2"
          >
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium">{label}</p>
              <span className="text-muted-foreground text-xs">
                {columnOpportunities.length}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map(({ stage, label, opportunities: columnOpportunities }) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            label={label}
            opportunities={columnOpportunities}
          />
        ))}
      </div>
    </DndContext>
  );
}
