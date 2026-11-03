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
import type { StageOption } from "@/lib/pipeline/stages";

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
  stages,
  currency,
  locale,
}: {
  opportunities: KanbanOpportunity[];
  stages: StageOption[];
  currency: string;
  locale: string;
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
    const newStageId = over.id as string;
    const current = items.find((item) => item.id === opportunityId);
    if (!current || current.stageId === newStageId) return;

    const previousStageId = current.stageId;
    setItems((prev) =>
      prev.map((item) =>
        item.id === opportunityId ? { ...item, stageId: newStageId } : item,
      ),
    );

    const rollback = (message: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === opportunityId
            ? { ...item, stageId: previousStageId }
            : item,
        ),
      );
      toast.error(message);
    };
    updateOpportunityStage(opportunityId, newStageId)
      .then((result) => {
        if (!result.ok) rollback(result.error);
      })
      .catch(() => rollback("No se pudo mover la oportunidad. Intenta de nuevo."));
  }

  const columns = stages.map((stage) => ({
    stage,
    opportunities: items.filter((item) => item.stageId === stage.id),
  }));

  // Columnas de ancho controlado con scroll horizontal propio: el tablero
  // nunca desborda la página (ni en mobile).
  const board =
    items.length === 0 ? (
      <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
        No hay oportunidades activas con estos filtros.
      </div>
    ) : (
      <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-3">
          {columns.map(({ stage, opportunities: columnOpportunities }) => (
            <KanbanColumn
              key={stage.id}
              stageId={stage.id}
              label={stage.label}
              opportunities={columnOpportunities}
              currency={currency}
              locale={locale}
            />
          ))}
        </div>
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
