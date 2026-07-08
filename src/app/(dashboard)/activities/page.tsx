import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { getActiveTeamMembers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { ActivityRow } from "@/components/shared/activities/activity-row";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SearchParams = {
  filter?: string;
  assignee?: string;
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

  const { user, db } = await requireOrgContext();

  const now = new Date();
  const statusWhere: Prisma.ActivityWhereInput =
    filter === "completed"
      ? { status: "completed" }
      : filter === "overdue"
        ? { status: "pending", dueDate: { lt: now } }
        : { status: "pending" };

  const assigneeWhere: Prisma.ActivityWhereInput =
    assignee === "me"
      ? { assignee: { userId: user.id } }
      : assignee === "none"
        ? { assigneeId: null }
        : assignee
          ? { assigneeId: assignee }
          : {};

  const [activities, teamMembers] = await Promise.all([
    db.activity.findMany({
      where: { ...statusWhere, ...assigneeWhere },
      include: {
        company: true,
        person: true,
        opportunity: true,
        assignee: { select: { id: true, name: true } },
      },
      orderBy:
        filter === "completed" ? { completedAt: "desc" } : { dueDate: "asc" },
    }),
    getActiveTeamMembers(db),
  ]);

  const isMine = assignee === "me";

  return (
    <div>
      <PageHeader
        title="Actividades"
        description="Tareas y recordatorios vinculados a empresas, personas y oportunidades"
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
        <form className="flex items-center gap-2">
          <input type="hidden" name="filter" value={filter} />
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

      <Tabs defaultValue={filter}>
        <TabsList>
          <TabsTrigger
            value="upcoming"
            nativeButton={false}
            render={<Link href={buildQuery(params, { filter: "upcoming" })} />}
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
            render={<Link href={buildQuery(params, { filter: "completed" })} />}
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
                </p>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
