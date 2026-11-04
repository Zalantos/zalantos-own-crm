import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { boardStages, getOrgStages } from "@/lib/pipeline/stages";
import { getActiveTeamMembers } from "@/lib/team";
import { getActivityFeed } from "@/lib/timeline";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatRow } from "@/components/shared/dashboard/stat-row";
import { PipelineChart } from "@/components/shared/dashboard/pipeline-chart";
import { RecentActivityFeed } from "@/components/shared/dashboard/recent-activity-feed";
import { ActivityRow } from "@/components/shared/activities/activity-row";
import { CommercialAlertsWidget } from "@/components/shared/dashboard/commercial-alerts-widget";
import { loadPendingAlerts } from "@/lib/commercial/alert-service";
import { InboundLeadsWidget } from "@/components/shared/dashboard/inbound-leads-widget";
import { ACTIVITY_OPEN_STATUSES } from "@/lib/activity-status";

const MY_TASKS_LIMIT = 6;

export default async function DashboardPage() {
  const now = new Date();
  const { user, org, db } = await requireOrgContext();

  const [
    companyCount,
    openOpportunityAggregate,
    overdueActivityCount,
    meetingsLast30Days,
    pendingAlerts,
    stages,
    stageCounts,
    { events: recentEvents },
    myTasks,
    myTaskCount,
    teamMembers,
    newLeadCount,
    recentNewLeads,
    activeLeadCounts,
    withoutNextAction,
    pausedDue,
  ] = await Promise.all([
    db.company.count(),
    db.opportunity.aggregate({
      where: { status: "open" },
      _count: true,
      _sum: { estimatedValue: true },
    }),
    db.activity.count({
      where: {
        occurredAt: null,
        status: { in: ACTIVITY_OPEN_STATUSES },
        dueDate: { lt: now },
      },
    }),
    db.activity.count({
      where: {
        type: "meeting",
        occurredAt: { gte: new Date(now.getTime() - 30 * 86_400_000), lte: now },
      },
    }),
    loadPendingAlerts(db, user.id),
    getOrgStages(db),
    db.opportunity.groupBy({
      by: ["stageId"],
      where: { status: "open" },
      _count: true,
    }),
    getActivityFeed(db, { page: 1 }),
    db.activity.findMany({
      where: {
        status: { in: ACTIVITY_OPEN_STATUSES },
        assignee: { userId: user.id },
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
    db.activity.count({
      where: {
        status: { in: ACTIVITY_OPEN_STATUSES },
        assignee: { userId: user.id },
      },
    }),
    getActiveTeamMembers(db),
    db.inboundLead.count({ where: { status: "new" } }),
    db.inboundLead.findMany({
      where: { status: "new" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, firstName: true, lastName: true, company: true, createdAt: true },
    }),
    db.commercialLead.groupBy({
      by: ["status"],
      where: { status: { in: ["prospect", "contacted", "lead"] } },
      _count: { _all: true },
    }),
    db.opportunity.count({
      where: { status: "open", OR: [{ nextStep: null }, { nextStepDueDate: null }] },
    }),
    db.opportunity.count({ where: { status: "paused", reactivateAt: { lte: now } } }),
  ]);
  const leadCount = (status: string) =>
    activeLeadCounts.find((row) => row.status === status)?._count._all ?? 0;

  const countByStageId = new Map(
    stageCounts.map((row) => [row.stageId, row._count]),
  );
  // Stock actual de oportunidades abiertas por etapa operativa. El funnel
  // analítico (cohortes, conversiones) vive en /analytics.
  const funnelStages = boardStages(stages);
  const chartColors = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];
  const inStageCounts = funnelStages.map(
    (stage) => countByStageId.get(stage.id) ?? 0,
  );
  const pipelineData = funnelStages.map((stage, index) => {
    const count = inStageCounts[index] ?? 0;
    const cumulative = inStageCounts
      .slice(index)
      .reduce((sum, stageCount) => sum + stageCount, 0);
    return {
      stage: stage.id,
      label: stage.label,
      count,
      cumulative,
      fill: chartColors[index % chartColors.length]!,
    };
  });

  return (
    <div>
      <PageHeader
        title="Inicio"
        description={`Resumen del pipeline comercial de ${org.brandName ?? org.name}`}
      />

      <div className="mb-6">
        <StatRow
          companyCount={companyCount}
          openOpportunityCount={openOpportunityAggregate._count}
          pipelineValue={Number(
            openOpportunityAggregate._sum.estimatedValue?.toString() ?? 0,
          )}
          overdueActivityCount={overdueActivityCount}
          meetingsLast30Days={meetingsLast30Days}
          currency={org.currency}
          locale={org.locale}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        {[
          { href: "/prospecting?status=prospect", label: "Prospectos", value: leadCount("prospect") },
          { href: "/prospecting?status=contacted", label: "Contactados", value: leadCount("contacted") },
          { href: "/prospecting?status=lead", label: "Leads", value: leadCount("lead") },
          { href: "/opportunities/list?noNext=1", label: "Oportunidades sin próxima acción", value: withoutNextAction },
          { href: "/opportunities/list?status=paused", label: "Pausadas por reactivar", value: pausedDue },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="hover:bg-muted rounded-md border p-3">
            <p className="text-muted-foreground text-xs">{item.label}</p>
            <p className="text-xl font-semibold">{item.value}</p>
          </Link>
        ))}
      </div>

      {pendingAlerts.total > 0 && (
        <div className="mb-4">
          <CommercialAlertsWidget {...pendingAlerts} userId={user.id} />
        </div>
      )}

      <div className="mb-4">
        <InboundLeadsWidget newCount={newLeadCount} recentLeads={recentNewLeads} />
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
            <CardTitle>
              Pipeline abierto por etapa{" "}
              <Link href="/analytics" className="text-muted-foreground text-xs font-normal hover:underline">
                Ver funnel comercial
              </Link>
            </CardTitle>
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
