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
import { TaskKanbanColumn } from "@/components/shared/tasks/task-kanban-column";
import type { TaskActivity } from "@/components/shared/tasks/task-kanban-card";
import { updateActivityStatus } from "@/app/(dashboard)/activities/actions";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_LABELS,
  isActivityStatus,
  type ActivityStatus,
} from "@/lib/activity-status";
import type { AssignableTeamMember } from "@/lib/team";

function subscribeNoop() {
  return () => {};
}

// Mismo workaround que el kanban de oportunidades: @dnd-kit genera ids de
// accesibilidad con un contador a nivel de módulo que difiere entre el
// render de servidor y el de cliente, lo que rompe la hidratación.
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function TaskKanbanBoard({
  activities,
  teamMembers,
}: {
  activities: TaskActivity[];
  teamMembers: AssignableTeamMember[];
}) {
  const [items, setItems] = useState(activities);
  const mounted = useMounted();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as string;
    if (!isActivityStatus(newStatus)) return;

    const current = items.find((item) => item.id === taskId);
    if (!current || current.status === newStatus) return;

    const previous = current;
    // Espeja en el cliente el auto-completado/limpieza de "completedById"
    // que hace updateActivityStatus en el servidor, para que la tarjeta no
    // titile hasta que revalide.
    let completedById = current.completedById;
    if (newStatus === "done") {
      completedById = current.assigneeId ?? null;
    } else if (current.status === "done") {
      completedById = null;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === taskId
          ? { ...item, status: newStatus, completedById }
          : item,
      ),
    );

    updateActivityStatus(taskId, newStatus as ActivityStatus).catch(() => {
      setItems((prev) =>
        prev.map((item) => (item.id === taskId ? previous : item)),
      );
      toast.error("No se pudo mover la tarea. Intenta de nuevo.");
    });
  }

  const columns = ACTIVITY_STATUSES.map((status) => ({
    status,
    tasks: items.filter((item) => item.status === status),
  }));

  const board = (
    <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 xl:grid-cols-4">
      {columns.map(({ status, tasks }) => (
        <TaskKanbanColumn
          key={status}
          status={status}
          label={ACTIVITY_STATUS_LABELS[status]}
          tasks={tasks}
          teamMembers={teamMembers}
        />
      ))}
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
