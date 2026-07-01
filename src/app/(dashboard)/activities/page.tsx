import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ActivityRow } from "@/components/shared/activities/activity-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "upcoming" } = await searchParams;

  const now = new Date();
  const activities = await prisma.activity.findMany({
    where:
      filter === "completed"
        ? { status: "completed" }
        : filter === "overdue"
          ? { status: "pending", dueDate: { lt: now } }
          : { status: "pending" },
    include: { company: true, person: true, opportunity: true },
    orderBy:
      filter === "completed" ? { completedAt: "desc" } : { dueDate: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Actividades"
        description="Tareas y recordatorios vinculados a empresas, personas y oportunidades"
      />

      <Tabs defaultValue={filter}>
        <TabsList>
          <TabsTrigger
            value="upcoming"
            nativeButton={false}
            render={<Link href="?filter=upcoming" />}
          >
            Próximas
          </TabsTrigger>
          <TabsTrigger
            value="overdue"
            nativeButton={false}
            render={<Link href="?filter=overdue" />}
          >
            Vencidas
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            nativeButton={false}
            render={<Link href="?filter=completed" />}
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
                <ActivityRow
                  activity={{
                    id: activity.id,
                    companyId: activity.companyId,
                    personId: activity.personId,
                    opportunityId: activity.opportunityId,
                    type: activity.type,
                    title: activity.title,
                    description: activity.description,
                    dueDate: activity.dueDate,
                    completedAt: activity.completedAt,
                    status: activity.status,
                    createdAt: activity.createdAt,
                    updatedAt: activity.updatedAt,
                  }}
                />
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
