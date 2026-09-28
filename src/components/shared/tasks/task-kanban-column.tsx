"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  TaskKanbanCard,
  type TaskActivity,
} from "@/components/shared/tasks/task-kanban-card";
import type { ActivityStatus } from "@/lib/activity-status";
import type { AssignableTeamMember } from "@/lib/team";

export function TaskKanbanColumn({
  status,
  label,
  tasks,
  teamMembers,
}: {
  status: ActivityStatus;
  label: string;
  tasks: TaskActivity[];
  teamMembers: AssignableTeamMember[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`bg-muted/15 flex min-h-48 min-w-0 flex-col gap-3 rounded-md border p-3 transition-colors ${
        isOver ? "border-primary/50 bg-muted/50 ring-primary/10 ring-2" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="text-muted-foreground text-xs">
          {tasks.length} {tasks.length === 1 ? "tarea" : "tareas"}
        </p>
      </div>

      <div className="flex min-h-20 flex-1 flex-col gap-2">
        {tasks.map((task) => (
          <TaskKanbanCard key={task.id} task={task} teamMembers={teamMembers} />
        ))}
        {tasks.length === 0 && (
          <div className="text-muted-foreground bg-background/70 flex flex-1 items-center justify-center rounded-md border border-dashed p-4 text-center text-xs">
            Suelta una tarea acá para moverla a esta columna.
          </div>
        )}
      </div>
    </div>
  );
}
