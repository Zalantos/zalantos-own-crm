import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { getActiveTeamMembers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { ActivityRow } from "@/components/shared/activities/activity-row";
import { TaskKanbanBoard } from "@/components/shared/tasks/task-kanban-board";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTIVITY_OPEN_STATUSES } from "@/lib/activity-status";

type SearchParams = {
  filter?: string;
  assignee?: string;
  view?: string;
  scope?: string;
  priority?: string;
  due?: string;
};

const SCOPES: Record<string, { label: string; where: Prisma.ActivityWhereInput }> = {
  opportunity: { label: "Oportunidades", where: { opportunityId: { not: null } } },
  lead: { label: "Prospección", where: { commercialLeadId: { not: null } } },
  partner: { label: "Partners", where: { commercialPartnerId: { not: null } } },
};

function buildQuery(params: SearchParams, overrides: Partial<SearchParams>) {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) query.set(key, value);
  }
  return `/activities?${query.toString()}`;
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filter = params.filter ?? "upcoming";
  const assignee = params.assignee;
  const view = params.view === "board" ? "board" : "list";

  const { user, db } = await requireOrgContext();

  const now = new Date();
  const statusWhere: Prisma.ActivityWhereInput =
    filter === "completed"
      ? { status: "done" }
      : filter === "overdue"
        ? { status: { in: ACTIVITY_OPEN_STATUSES }, dueDate: { lt: now } }
        : { status: { in: ACTIVITY_OPEN_STATUSES } };

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86_400_000);
  // Solo tareas: las interacciones registradas (occurredAt) no son
  // pendientes y viven en el historial de contactos de cada ficha.
  const extraWhere: Prisma.ActivityWhereInput = {
    occurredAt: null,
    ...(params.scope && SCOPES[params.scope] ? SCOPES[params.scope].where : {}),
    ...(params.priority === "none"
      ? { priority: null }
      : params.priority
        ? { priority: params.priority }
        : {}),
    ...(params.due === "overdue"
      ? { dueDate: { lt: startOfToday } }
      : params.due === "today"
        ? { dueDate: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86_400_000) } }
        : params.due === "week"
          ? { dueDate: { gte: startOfToday, lt: endOfWeek } }
          : params.due === "none"
            ? { dueDate: null }
            : {}),
  };

  const assigneeWhere: Prisma.ActivityWhereInput =
    assignee === "me"
      ? { assignee: { userId: user.id } }
      : assignee === "none"
        ? { assigneeId: null }
        : assignee
          ? { assigneeId: assignee }
          : {};

  const [activities, boardActivities, teamMembers] = await Promise.all([
    view === "list"
      ? db.activity.findMany({
          where: { ...statusWhere, ...assigneeWhere, ...extraWhere },
          include: {
            company: true,
            person: true,
            opportunity: true,
            commercialLead: { select: { id: true, title: true } },
            commercialPartner: { select: { id: true, displayName: true } },
            assignee: { select: { id: true, name: true } },
          },
          orderBy:
            filter === "completed"
              ? { completedAt: "desc" }
              : { dueDate: "asc" },
        })
      : Promise.resolve([]),
    view === "board"
      ? db.activity.findMany({
          where: { ...assigneeWhere, ...extraWhere },
          include: {
            company: true,
            person: true,
            opportunity: true,
            commercialLead: { select: { id: true, title: true } },
            commercialPartner: { select: { id: true, displayName: true } },
            assignee: { select: { id: true, name: true } },
            completedBy: { select: { id: true, name: true } },
          },
          orderBy: { dueDate: "asc" },
        })
      : Promise.resolve([]),
    getActiveTeamMembers(db),
  ]);

  const isMine = assignee === "me";

  return (
    <div>
      <PageHeader
        title="Actividades"
        description="Tareas comerciales: oportunidades, prospección y partners. Las tareas de ejecución de proyectos viven en Rumbo."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant={isMine ? "default" : "secondary"}
          render={
            <Link
              href={buildQuery(params, { assignee: isMine ? undefined : "me" })}
            />
          }
        >
          Mis tareas
        </Button>
        <Button
          variant="secondary"
          render={
            <Link
              href={buildQuery(params, {
                view: view === "board" ? undefined : "board",
              })}
            />
          }
        >
          {view === "board" ? "Ver como lista" : "Ver como tablero"}
        </Button>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="filter" value={filter} />
          {view === "board" && <input type="hidden" name="view" value="board" />}
          <select name="scope" defaultValue={params.scope ?? ""} className="bg-background h-9 rounded-md border px-2 text-sm">
            <option value="">Todo vínculo</option>
            {Object.entries(SCOPES).map(([value, scope]) => (
              <option key={value} value={value}>
                {scope.label}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue={params.priority ?? ""} className="bg-background h-9 rounded-md border px-2 text-sm">
            <option value="">Toda prioridad</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
            <option value="none">Sin prioridad</option>
          </select>
          <select name="due" defaultValue={params.due ?? ""} className="bg-background h-9 rounded-md border px-2 text-sm">
            <option value="">Todo vencimiento</option>
            <option value="overdue">Vencidas</option>
            <option value="today">Vencen hoy</option>
            <option value="week">Próximos 7 días</option>
            <option value="none">Sin fecha</option>
          </select>
          <Select name="assignee" defaultValue={isMine ? "" : (assignee ?? "")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos los responsables" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los responsables</SelectItem>
              <SelectItem value="none">Sin responsable</SelectItem>
              {teamMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>
      </div>

      {view === "board" ? (
        <TaskKanbanBoard
          activities={boardActivities}
          teamMembers={teamMembers}
        />
      ) : (
        <Tabs defaultValue={filter}>
          <TabsList>
            <TabsTrigger
              value="upcoming"
              nativeButton={false}
              render={
                <Link href={buildQuery(params, { filter: "upcoming" })} />
              }
            >
              Próximas
            </TabsTrigger>
            <TabsTrigger
              value="overdue"
              nativeButton={false}
              render={<Link href={buildQuery(params, { filter: "overdue" })} />}
            >
              Vencidas
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              nativeButton={false}
              render={
                <Link href={buildQuery(params, { filter: "completed" })} />
              }
            >
              Completadas
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="space-y-2 pt-4">
            {activities.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No hay actividades en este filtro.
              </p>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="space-y-1">
                  <ActivityRow activity={activity} teamMembers={teamMembers} />
                  <p className="text-muted-foreground pl-3 text-xs">
                    {activity.company && (
                      <Link
                        href={`/companies/${activity.company.id}`}
                        className="hover:underline"
                      >
                        {activity.company.name}
                      </Link>
                    )}
                    {activity.person && (
                      <Link
                        href={`/people/${activity.person.id}`}
                        className="hover:underline"
                      >
                        {activity.person.firstName} {activity.person.lastName}
                      </Link>
                    )}
                    {activity.opportunity && (
                      <Link
                        href={`/opportunities/${activity.opportunity.id}`}
                        className="hover:underline"
                      >
                        {activity.opportunity.name}
                      </Link>
                    )}
                    {activity.commercialLead && (
                      <Link
                        href={`/prospecting/${activity.commercialLead.id}`}
                        className="hover:underline"
                      >
                        Prospecto: {activity.commercialLead.title}
                      </Link>
                    )}
                    {activity.commercialPartner && (
                      <Link
                        href={`/partners/${activity.commercialPartner.id}`}
                        className="hover:underline"
                      >
                        Partner: {activity.commercialPartner.displayName}
                      </Link>
                    )}
                  </p>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
