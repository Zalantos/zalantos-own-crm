"use client";

import { useState } from "react";
import { isPast } from "date-fns";
import { ActivityCreateForm } from "@/components/shared/activities/activity-create-form";
import {
  ActivityRow,
  type ActivityWithAssignee,
} from "@/components/shared/activities/activity-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVITY_OPEN_STATUSES,
  isActivityStatus,
} from "@/lib/activity-status";
import type { AssignableTeamMember } from "@/lib/team";

type StatusFilter = "all" | "open" | "overdue" | "done";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Abiertas" },
  { value: "overdue", label: "Vencidas" },
  { value: "done", label: "Completadas" },
];

const STATUS_FILTER_ITEMS = Object.fromEntries(
  STATUS_FILTERS.map((filter) => [filter.value, filter.label]),
);

function isOpen(status: string) {
  return isActivityStatus(status)
    ? ACTIVITY_OPEN_STATUSES.includes(status)
    : status !== "done";
}

function matchesStatus(activity: ActivityWithAssignee, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "done") return activity.status === "done";
  const open = isOpen(activity.status);
  if (filter === "open") return open;
  return open && !!activity.dueDate && isPast(new Date(activity.dueDate));
}

function matchesAssignee(activity: ActivityWithAssignee, filter: string) {
  if (filter === "all") return true;
  if (filter === "none") return !activity.assigneeId;
  return activity.assigneeId === filter;
}

export function ActivitiesList({
  activities,
  teamMembers,
  companyId,
  personId,
  opportunityId,
}: {
  activities: ActivityWithAssignee[];
  teamMembers: AssignableTeamMember[];
  companyId?: string;
  personId?: string;
  opportunityId?: string;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  const visible = activities.filter(
    (activity) =>
      matchesStatus(activity, statusFilter) &&
      matchesAssignee(activity, assigneeFilter),
  );

  const assigneeItems: Record<string, string> = {
    all: "Todos los responsables",
    none: "Sin responsable",
    ...Object.fromEntries(
      teamMembers.map((member) => [member.id, member.name]),
    ),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {activities.length > 0 && (
          <>
            <Select
              items={STATUS_FILTER_ITEMS}
              value={statusFilter}
              onValueChange={(value) => {
                if (value) setStatusFilter(value as StatusFilter);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={assigneeItems}
              value={assigneeFilter}
              onValueChange={(value) => {
                if (value) setAssigneeFilter(value);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los responsables</SelectItem>
                <SelectItem value="none">Sin responsable</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <div className="ml-auto">
          <ActivityCreateForm
            companyId={companyId}
            personId={personId}
            opportunityId={opportunityId}
            teamMembers={teamMembers}
          />
        </div>
      </div>
      <div className="space-y-2">
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay actividades.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Ninguna actividad con ese filtro.
          </p>
        ) : (
          visible.map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              teamMembers={teamMembers}
            />
          ))
        )}
      </div>
    </div>
  );
}
