import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/shared/kanban/kanban-board";

export default async function OpportunitiesKanbanPage() {
  const { org, db } = await requireOrgContext();
  const [rows, stages] = await Promise.all([
    db.opportunity.findMany({
      include: { company: true },
      orderBy: { createdAt: "desc" },
    }),
    getOrgStages(db),
  ]);

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
        stages={stages}
        currency={org.currency}
        locale={org.locale}
      />
    </div>
  );
}
