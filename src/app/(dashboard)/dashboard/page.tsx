import { prisma } from "@/lib/prisma";
import { getActivityFeed } from "@/lib/timeline";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatRow } from "@/components/shared/dashboard/stat-row";
import { PipelineChart } from "@/components/shared/dashboard/pipeline-chart";
import { RecentActivityFeed } from "@/components/shared/dashboard/recent-activity-feed";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
} from "@/lib/zod/opportunity";

export default async function DashboardPage() {
  const now = new Date();

  const [
    companyCount,
    openOpportunityAggregate,
    overdueActivityCount,
    meetingsTotalCount,
    meetingsReadyCount,
    stageCounts,
    { events: recentEvents },
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
