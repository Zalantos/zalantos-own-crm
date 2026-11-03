import { ActivityRow } from "@/components/shared/activities/activity-row";
import { ActivityCreateForm } from "@/components/shared/activities/activity-create-form";
import { InteractionLogForm } from "@/components/shared/activities/interaction-log-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activityTypeLabel } from "@/lib/activity-types";
import { actorLabel } from "@/lib/traceability";
import type { FollowUpRecords } from "@/lib/commercial/follow-up";
import type { AssignableTeamMember } from "@/lib/team";

function formatDateTime(date: Date | null) {
  return date ? date.toISOString().slice(0, 16).replace("T", " ") : "—";
}

// Seguimiento comercial de una ficha: tareas abiertas, tareas realizadas e
// historial de contactos (interacciones registradas). Tareas = pendiente;
// interacciones = algo que ya ocurrió.
export function FollowUpPanel({
  records,
  teamMembers,
  links,
  people = [],
  offerMarkContacted = false,
}: {
  records: FollowUpRecords;
  teamMembers: AssignableTeamMember[];
  links: {
    companyId?: string;
    personId?: string;
    opportunityId?: string;
    commercialLeadId?: string;
    commercialPartnerId?: string;
  };
  people?: { id: string; label: string }[];
  offerMarkContacted?: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card size="sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Tareas abiertas ({records.openTasks.length})</CardTitle>
          <ActivityCreateForm
            {...links}
            teamMembers={teamMembers}
            triggerLabel="Nueva tarea"
          />
        </CardHeader>
        <CardContent className="space-y-2">
          {records.openTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin tareas pendientes.</p>
          ) : (
            records.openTasks.map((task) => (
              <ActivityRow key={task.id} activity={task} teamMembers={teamMembers} />
            ))
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Historial de contactos ({records.interactions.length})</CardTitle>
          <InteractionLogForm
            {...links}
            people={people}
            offerMarkContacted={offerMarkContacted}
          />
        </CardHeader>
        <CardContent>
          {records.interactions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no hay interacciones registradas.
            </p>
          ) : (
            <ol className="space-y-3 border-l pl-4">
              {records.interactions.map((interaction) => (
                <li key={interaction.id} className="relative space-y-0.5">
                  <span className="bg-primary absolute top-1.5 -left-[21px] size-2 rounded-full" />
                  <p className="text-sm font-medium">
                    {activityTypeLabel(interaction.type)} · {interaction.title}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDateTime(interaction.occurredAt)}
                    {interaction.person
                      ? ` · ${interaction.person.firstName} ${interaction.person.lastName}`
                      : ""}
                    {` · ${actorLabel(interaction.createdBy)}`}
                  </p>
                  {interaction.description && (
                    <p className="text-sm whitespace-pre-wrap">{interaction.description}</p>
                  )}
                  {interaction.outcomes && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Resultado: </span>
                      {interaction.outcomes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card size="sm" className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Tareas realizadas ({records.doneTasks.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {records.doneTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin tareas completadas.</p>
          ) : (
            records.doneTasks.map((task) => (
              <div key={task.id} className="space-y-1">
                <ActivityRow activity={task} teamMembers={teamMembers} />
                {task.outcomes && (
                  <p className="text-muted-foreground pl-3 text-xs">Resultado: {task.outcomes}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
