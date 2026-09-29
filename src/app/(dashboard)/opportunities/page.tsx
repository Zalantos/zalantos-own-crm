import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
import {
  knownHiddenStageIds,
  opportunityStageWhere,
} from "@/lib/opportunities/hidden-stages";
import { readHiddenStageIds } from "@/lib/opportunities/read-hidden-stages";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/shared/kanban/kanban-board";
import { StageVisibilityMenu } from "@/components/shared/opportunities/stage-visibility-menu";

export default async function OpportunitiesKanbanPage() {
  const { org, db } = await requireOrgContext();
  const [stages, hiddenRaw] = await Promise.all([
    getOrgStages(db),
    readHiddenStageIds(),
  ]);
  const hiddenStageIds = knownHiddenStageIds(hiddenRaw, stages);
  const rows = await db.opportunity.findMany({
    where: opportunityStageWhere(hiddenStageIds),
    include: { company: true },
    orderBy: { createdAt: "desc" },
  });
  const visibleStages = stages.filter(
    (stage) => !hiddenStageIds.includes(stage.id),
  );

  const opportunities = rows.map((row) => ({
    ...row,
    estimatedValue: row.estimatedValue ? row.estimatedValue.toNumber() : null,
  }));

  return (
    <div>
      <PageHeader
        title="Pipeline de oportunidades"
        description="Arrastra las tarjetas para cambiar de etapa"
        actions={
          <>
            <StageVisibilityMenu
              stages={stages}
              hiddenStageIds={hiddenStageIds}
            />
            <Button
              variant="secondary"
              render={<Link href="/opportunities/list" />}
            >
              Ver como lista
            </Button>
            <Button render={<Link href="/opportunities/new" />}>
              Nueva oportunidad
            </Button>
          </>
        }
      />
      <KanbanBoard
        opportunities={opportunities}
        stages={visibleStages}
        currency={org.currency}
        locale={org.locale}
      />
    </div>
  );
}
