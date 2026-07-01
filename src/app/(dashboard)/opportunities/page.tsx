import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/shared/kanban/kanban-board";

export default async function OpportunitiesKanbanPage() {
  const rows = await prisma.opportunity.findMany({
    include: { company: true },
    orderBy: { createdAt: "desc" },
  });

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
      <KanbanBoard opportunities={opportunities} />
    </div>
  );
}
