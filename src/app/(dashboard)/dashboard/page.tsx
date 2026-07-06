import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getActiveTeamMembers } from "@/lib/team";
import { getActivityFeed } from "@/lib/timeline";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatRow } from "@/components/shared/dashboard/stat-row";
import { PipelineChart } from "@/components/shared/dashboard/pipeline-chart";
import { RecentActivityFeed } from "@/components/shared/dashboard/recent-activity-feed";
import { ActivityRow } from "@/components/shared/activities/activity-row";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
} from "@/lib/zod/opportunity";

const MY_TASKS_LIMIT = 6;

export default async function DashboardPage() {
  const now = new Date();
  const currentUser = await getCurrentUser();

  const [
    companyCount,
    openOpportunityAggregate,
    overdueActivityCount,
    meetingsTotalCount,
    meetingsReadyCount,
    stageCounts,
    { events: recentEvents },
    myTasks,
    myTaskCount,
    teamMembers,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.opportunity.aggregate({
      where: { status: "open" },
      _count: true,
      _sum: { estimatedValue: true },
    }),
    prisma.activity.count({
      where: { status: "pending", dueDate: { lt: now } },
    }),
    prisma.meeting.count(),
    prisma.meeting.count({ where: { processingStatus: "ready" } }),
    prisma.opportunity.groupBy({
      by: ["stage"],
      where: { status: "open" },
      _count: true,
    }),
    getActivityFeed({ page: 1 }),
    prisma.activity.findMany({
      where: {
        status: "pending",
        assignee: { userId: currentUser?.id ?? "" },
      },
      include: {
        assignee: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: MY_TASKS_LIMIT,
    }),
    prisma.activity.count({
      where: {
        status: "pending",
        assignee: { userId: currentUser?.id ?? "" },
      },
    }),
    getActiveTeamMembers(),
  ]);

  const countByStage = new Map(
    stageCounts.map((row) => [row.stage, row._count]),
  );
  const pipelineData = OPPORTUNITY_STAGES.map((stage) => ({
    stage,
    label: OPPORTUNITY_STAGE_LABELS[stage],
    count: countByStage.get(stage) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Inicio"
        description="Resumen del pipeline comercial de Zalantos"
      />

      <div className="mb-6">
        <StatRow
          companyCount={companyCount}
          openOpportunityCount={openOpportunityAggregate._count}
          pipelineValue={Number(
            openOpportunityAggregate._sum.estimatedValue?.toString() ?? 0,
          )}
          overdueActivityCount={overdueActivityCount}
          meetingsReadyCount={meetingsReadyCount}
          meetingsTotalCount={meetingsTotalCount}
        />
      </div>

      {myTasks.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Mis tareas por hacer</CardTitle>
            <Link
              href="/activities?assignee=me"
              className="text-muted-foreground text-sm hover:underline"
            >
              Ver todas ({myTaskCount})
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {myTasks.map((activity) => (
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
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Pipeline por etapa</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineChart data={pipelineData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentActivityFeed events={recentEvents.slice(0, 8)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
