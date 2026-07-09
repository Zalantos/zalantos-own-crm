"use client";

import { useState, useActionState } from "react";
import { format, isPast } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  assignActivity,
  completeActivity,
  reopenActivity,
  deleteActivity,
  updateActivity,
  type ActivityFormState,
} from "@/app/(dashboard)/activities/actions";
import { actorLabel, createdViaLabel } from "@/lib/traceability";
import type { Activity } from "@prisma/client";
import type { AssignableTeamMember } from "@/lib/team";

const ACTIVITY_TYPES = ["call", "email", "meeting", "task", "follow_up"];

type ActivityWithAssignee = Activity & {
  assignee?: { id: string; name: string } | null;
  createdBy?: { name: string | null; email: string | null } | null;
};

function formatDueDateForInput(dueDate: Date | null) {
  return dueDate ? new Date(dueDate).toISOString().slice(0, 10) : "";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// El asignado actual puede estar desactivado (fuera de teamMembers); se
// agrega como opción para que el select refleje el estado real.
function AssigneeSelect({
  activity,
  teamMembers,
  name,
  onChange,
}: {
  activity: ActivityWithAssignee;
  teamMembers: AssignableTeamMember[];
  name?: string;
  onChange?: (assigneeId: string | null) => void;
}) {
  const currentIsListed =
    !activity.assigneeId ||
    teamMembers.some((member) => member.id === activity.assigneeId);

  return (
    <select
      name={name}
      defaultValue={activity.assigneeId ?? ""}
      onChange={
        onChange ? (event) => onChange(event.target.value || null) : undefined
      }
      className="bg-background h-8 rounded-md border px-2 text-xs"
    >
      <option value="">Sin responsable</option>
      {!currentIsListed && activity.assigneeId && (
        <option value={activity.assigneeId}>
          {activity.assignee?.name ?? "Persona desactivada"}
        </option>
      )}
      {teamMembers.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </select>
  );
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

  const isCompleted = activity.status === "completed";
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
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
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
      <div className="flex items-center gap-3">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => {
            const action = isCompleted ? reopenActivity : completeActivity;
            void action(activity.id);
          }}
        />
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
            <span>{activity.type}</span>
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
      </div>
      <div className="flex items-center gap-2">
        {isOverdue && <Badge variant="destructive">Vencida</Badge>}
        <AssigneeSelect
          activity={activity}
          teamMembers={teamMembers}
          onChange={(assigneeId) => void assignActivity(activity.id, assigneeId)}
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
