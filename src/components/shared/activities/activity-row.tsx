"use client";

import { useState, useActionState } from "react";
import { format, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  assignActivity,
  deleteActivity,
  updateActivity,
  updateActivityStatus,
  type ActivityFormState,
} from "@/app/(dashboard)/activities/actions";
import { actorLabel, createdViaLabel } from "@/lib/traceability";
import { initials } from "@/lib/format";
import { TeamMemberSelect } from "@/components/shared/activities/team-member-select";
import { TaskStatusSelect } from "@/components/shared/activities/task-status-select";
import { isActivityStatus } from "@/lib/activity-status";
import {
  ACTIVITY_TYPES,
  activityTypeLabel,
  isActivityType,
} from "@/lib/activity-types";
import type { Activity } from "@prisma/client";
import type { AssignableTeamMember } from "@/lib/team";

export type ActivityWithAssignee = Activity & {
  assignee?: { id: string; name: string } | null;
  createdBy?: { name: string | null; email: string | null } | null;
};

function formatDueDateForInput(dueDate: Date | null) {
  return dueDate ? new Date(dueDate).toISOString().slice(0, 10) : "";
}

export function ActivityRow({
  activity,
  teamMembers,
}: {
  activity: ActivityWithAssignee;
  teamMembers: AssignableTeamMember[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<ActivityFormState, FormData>(
    updateActivity,
    undefined,
  );

  const isCompleted = activity.status === "done";
  const isOverdue =
    !isCompleted && activity.dueDate && isPast(activity.dueDate);

  if (editing) {
    return (
      <form
        action={async (formData) => {
          await formAction(formData);
          setEditing(false);
        }}
        className="space-y-2 rounded-md border p-3"
      >
        <input type="hidden" name="id" value={activity.id} />
        <Input
          name="title"
          defaultValue={activity.title}
          placeholder="Título"
          required
        />
        <select
          name="type"
          defaultValue={activity.type}
          className="bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          {(isActivityType(activity.type)
            ? ACTIVITY_TYPES
            : [activity.type, ...ACTIVITY_TYPES]
          ).map((type) => (
            <option key={type} value={type}>
              {activityTypeLabel(type)}
            </option>
          ))}
        </select>
        <Input
          name="dueDate"
          type="date"
          defaultValue={formatDueDateForInput(activity.dueDate)}
        />
        <Textarea
          name="description"
          defaultValue={activity.description ?? ""}
          placeholder="Descripción (opcional)"
          rows={2}
        />
        {state?.error && (
          <p className="text-destructive text-xs">{state.error}</p>
        )}
        <div className="flex gap-2">
          <SubmitButton>Guardar</SubmitButton>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div>
        <p
          className={
            isCompleted
              ? "text-muted-foreground text-sm line-through"
              : "text-sm font-medium"
          }
        >
          {activity.title}
        </p>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>{activityTypeLabel(activity.type)}</span>
          <span>
            creada por {actorLabel(activity.createdBy)} vía{" "}
            {createdViaLabel(activity.createdVia)}
          </span>
          {activity.dueDate && (
            <span className={isOverdue ? "text-destructive" : ""}>
              vence {format(activity.dueDate, "dd/MM/yyyy")}
            </span>
          )}
          {activity.assignee && (
            <span className="flex items-center gap-1">
              <Avatar size="sm">
                <AvatarFallback>
                  {initials(activity.assignee.name)}
                </AvatarFallback>
              </Avatar>
              {activity.assignee.name}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isOverdue && <Badge variant="destructive">Vencida</Badge>}
        <TaskStatusSelect
          status={isActivityStatus(activity.status) ? activity.status : "todo"}
          onChange={(next) => void updateActivityStatus(activity.id, next)}
        />
        <TeamMemberSelect
          teamMembers={teamMembers}
          currentId={activity.assigneeId}
          currentName={activity.assignee?.name}
          onChange={(assigneeId) =>
            void assignActivity(activity.id, assigneeId)
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
        >
          Editar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void deleteActivity(activity.id)}
        >
          Eliminar
        </Button>
      </div>
    </div>
  );
}
