import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SavedViewSelector } from "@/components/shared/saved-view-selector";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
} from "@/lib/zod/opportunity";
import type { Company, Opportunity } from "@prisma/client";

type OpportunityRow = Opportunity & { company: Company };

export default async function OpportunitiesListPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    urgency?: string;
    status?: string;
    overdue?: string;
  }>;
}) {
  const { stage, urgency, status, overdue } = await searchParams;

  const opportunities = await prisma.opportunity.findMany({
    where: {
      ...(stage ? { stage: stage as Opportunity["stage"] } : {}),
      ...(urgency ? { urgency } : {}),
      ...(status ? { status } : {}),
      ...(overdue === "1"
        ? { nextStepDueDate: { lt: new Date() }, status: "open" }
        : {}),
    },
    include: { company: true },
    orderBy: { createdAt: "desc" },
  });

  const savedViews = await prisma.savedView.findMany({
    where: { entityType: "opportunity" },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Oportunidades"
        actions={
          <>
            <Button variant="secondary" render={<Link href="/opportunities" />}>
              Ver kanban
            </Button>
            <Button render={<Link href="/opportunities/new" />}>
              Nueva oportunidad
            </Button>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <select
          name="stage"
          defaultValue={stage ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todas las etapas</option>
          {OPPORTUNITY_STAGES.map((s) => (
            <option key={s} value={s}>
              {OPPORTUNITY_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          name="urgency"
          defaultValue={urgency ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Toda urgencia</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todo estado</option>
          <option value="open">open</option>
          <option value="won">won</option>
          <option value="lost">lost</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            name="overdue"
            value="1"
            defaultChecked={overdue === "1"}
            className="border-input h-4 w-4 rounded"
          />
          Próximo paso vencido
        </label>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <div className="mb-4">
        <SavedViewSelector
          entityType="opportunity"
          basePath="/opportunities/list"
          savedViews={savedViews}
        />
      </div>

      <DataTable<OpportunityRow>
        rows={opportunities}
        rowHref={(row) => `/opportunities/${row.id}`}
        emptyMessage="No hay oportunidades con estos filtros."
        columns={[
          { header: "Nombre", cell: (row) => row.name },
          { header: "Empresa", cell: (row) => row.company.name },
          {
            header: "Etapa",
            cell: (row) => (
              <Badge variant="outline">
                {OPPORTUNITY_STAGE_LABELS[row.stage]}
              </Badge>
            ),
          },
          {
            header: "Valor",
            cell: (row) =>
              row.estimatedValue ? `$${row.estimatedValue.toString()}` : "—",
          },
          {
            header: "Próximo paso",
            cell: (row) => row.nextStep ?? "—",
          },
        ]}
      />
    </div>
  );
}
