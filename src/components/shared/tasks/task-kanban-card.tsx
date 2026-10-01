"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { TaskEditDialog } from "@/components/shared/tasks/task-edit-dialog";
import { TaskStatusSelect } from "@/components/shared/activities/task-status-select";
import { updateActivityStatus } from "@/app/(dashboard)/activities/actions";
import { isActivityStatus } from "@/lib/activity-status";
import type { Activity, Company, Person, Opportunity } from "@prisma/client";
import type { AssignableTeamMember } from "@/lib/team";

export type TaskActivity = Activity & {
  company: Company | null;
  person: Person | null;
  opportunity: Opportunity | null;
  assignee: { id: string; name: string } | null;
  completedBy?: { id: string; name: string } | null;
};

function parentLabel(task: TaskActivity) {
  if (task.opportunity) return task.opportunity.name;
  if (task.company) return task.company.name;
  if (task.person) return `${task.person.firstName} ${task.person.lastName}`;
  return null;
}

function formatShortDate(date: Date) {
  return new Date(date).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function TaskKanbanCard({
  task,
  teamMembers,
}: {
  task: TaskActivity;
  teamMembers: AssignableTeamMember[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  const isOverdue =
    task.status !== "done" && task.dueDate && isPast(task.dueDate);
  const parent = parentLabel(task);

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform) }}
        {...listeners}
        {...attributes}
        onClick={() => {
          if (!isDragging) setDialogOpen(true);
        }}
        className={`bg-card ring-foreground/10 min-w-0 cursor-grab space-y-2 rounded-xl p-3 text-sm shadow-sm ring-1 transition-shadow active:cursor-grabbing ${
          isDragging ? "opacity-50 shadow-md" : "hover:shadow-md"
        }`}
      >
        <p className="line-clamp-2 leading-snug font-medium">{task.title}</p>
        {parent && (
          <p className="text-muted-foreground truncate text-xs">{parent}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <TaskStatusSelect
              status={isActivityStatus(task.status) ? task.status : "todo"}
              onChange={(next) => void updateActivityStatus(task.id, next)}
            />
          </span>
          {isOverdue && <Badge variant="destructive">Vencida</Badge>}
          {task.plannedDate && (
            <Badge variant="outline">
              Planeada {formatShortDate(task.plannedDate)}
            </Badge>
          )}
          {task.dueDate && (
            <Badge variant="outline">
              Vence {formatShortDate(task.dueDate)}
            </Badge>
          )}
        </div>

        {task.status === "blocked" && task.blockedReason && (
          <div className="bg-muted/40 rounded-md px-2 py-1.5">
            <p className="text-muted-foreground line-clamp-2 text-xs">
              <span className="text-foreground font-medium">Bloqueada:</span>{" "}
              {task.blockedReason}
            </p>
          </div>
        )}

        {task.assignee && (
          <div className="flex items-center gap-1.5">
            <Avatar size="sm">
              <AvatarFallback>{initials(task.assignee.name)}</AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground text-xs">
              {task.assignee.name}
            </span>
          </div>
        )}
      </div>

      <TaskEditDialog
        task={task}
        teamMembers={teamMembers}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
