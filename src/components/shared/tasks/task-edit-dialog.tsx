"use client";

import { useActionState, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { TeamMemberSelect } from "@/components/shared/activities/team-member-select";
import { TaskStatusSelect } from "@/components/shared/activities/task-status-select";
import {
  updateActivity,
  updateActivityStatus,
  type ActivityFormState,
} from "@/app/(dashboard)/activities/actions";
import { isActivityStatus, type ActivityStatus } from "@/lib/activity-status";
import {
  ACTIVITY_TYPES,
  activityTypeLabel,
  isActivityType,
} from "@/lib/activity-types";
import type { TaskActivity } from "@/components/shared/tasks/task-kanban-card";
import type { AssignableTeamMember } from "@/lib/team";

function formatDateForInput(date: Date | null) {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

export function TaskEditDialog({
  task,
  teamMembers,
  open,
  onOpenChange,
}: {
  task: TaskActivity;
  teamMembers: AssignableTeamMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<ActivityStatus>(
    isActivityStatus(task.status) ? task.status : "todo",
  );
  const [state, formAction] = useActionState<ActivityFormState, FormData>(
    updateActivity,
    undefined,
  );

  // El cambio de estado tiene efectos propios (completedAt/completedById,
  // timeline, workflows) que vive en updateActivityStatus, así que se
  // dispara aparte del submit del form general — mismo patrón que ya usa
  // el responsable (assignActivity) en activity-row.tsx.
  function handleStatusChange(next: ActivityStatus) {
    setStatus(next);
    void updateActivityStatus(task.id, next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar tarea</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>

        <form
          action={async (formData) => {
            await formAction(formData);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={task.id} />
          <Input
            name="title"
            defaultValue={task.title}
            placeholder="Título"
            required
          />
          <select
            name="type"
            defaultValue={task.type}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {(isActivityType(task.type)
              ? ACTIVITY_TYPES
              : [task.type, ...ACTIVITY_TYPES]
            ).map((type) => (
              <option key={type} value={type}>
                {activityTypeLabel(type)}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Fecha planeada</span>
              <Input
                name="plannedDate"
                type="date"
                defaultValue={formatDateForInput(task.plannedDate)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Fecha límite</span>
              <Input
                name="dueDate"
                type="date"
                defaultValue={formatDateForInput(task.dueDate)}
              />
            </label>
          </div>

          <Textarea
            name="description"
            defaultValue={task.description ?? ""}
            placeholder="Descripción (opcional)"
            rows={2}
          />

          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Estado</label>
            <div>
              <TaskStatusSelect status={status} onChange={handleStatusChange} />
            </div>
          </div>

          {status === "blocked" && (
            <Textarea
              name="blockedReason"
              defaultValue={task.blockedReason ?? ""}
              placeholder="¿Por qué está bloqueada?"
              rows={2}
            />
          )}

          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">
              Quién hizo la tarea
            </label>
            <TeamMemberSelect
              teamMembers={teamMembers}
              currentId={task.completedById}
              currentName={task.completedBy?.name}
              name="completedById"
              placeholder="Sin registrar"
            />
          </div>

          {state?.error && (
            <p className="text-destructive text-xs">{state.error}</p>
          )}

          <DialogFooter>
            <SubmitButton>Guardar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
