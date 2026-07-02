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
  const [expandedEmptyStages, setExpandedEmptyStages] = useState<
    OpportunityStage[]
  >([]);
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

  const visibleColumns = columns.filter(
    ({ stage, opportunities: columnOpportunities }) =>
      columnOpportunities.length > 0 || expandedEmptyStages.includes(stage),
  );
  const emptyStages = columns.filter(
    ({ stage, opportunities: columnOpportunities }) =>
      columnOpportunities.length === 0 && !expandedEmptyStages.includes(stage),
  );

  function expandEmptyStage(stage: OpportunityStage) {
    setExpandedEmptyStages((prev) =>
      prev.includes(stage) ? prev : [...prev, stage],
    );
  }

  const board = (
    <div className="space-y-4">
      {visibleColumns.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleColumns.map(
            ({ stage, label, opportunities: columnOpportunities }) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                label={label}
                opportunities={columnOpportunities}
              />
            ),
          )}
        </div>
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No hay oportunidades en el pipeline todavía.
        </div>
      )}

      {emptyStages.length > 0 && (
        <section className="rounded-md border border-dashed bg-muted/10 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Etapas vacías</p>
            <span className="text-muted-foreground text-xs">
              {emptyStages.length} ocultas
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {emptyStages.map(({ stage, label }) => (
              <button
                key={stage}
                type="button"
                onClick={() => expandEmptyStage(stage)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  if (!mounted) {
    return board;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {board}
    </DndContext>
  );
}
