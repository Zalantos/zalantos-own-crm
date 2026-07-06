import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SavedViewSelector } from "@/components/shared/saved-view-selector";
import { OpportunityStageBadge } from "@/components/shared/opportunities/status-badge";
import { formatCurrency } from "@/lib/currency";
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
        <Select name="stage" defaultValue={stage ?? ""}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Todas las etapas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas las etapas</SelectItem>
            {OPPORTUNITY_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {OPPORTUNITY_STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="urgency" defaultValue={urgency ?? ""}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Toda urgencia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Toda urgencia</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
          </SelectContent>
        </Select>
        <Select name="status" defaultValue={status ?? ""}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Todo estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todo estado</SelectItem>
            <SelectItem value="open">Abierta</SelectItem>
            <SelectItem value="won">Ganada</SelectItem>
            <SelectItem value="lost">Perdida</SelectItem>
          </SelectContent>
        </Select>
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
            cell: (row) => <OpportunityStageBadge stage={row.stage} />,
          },
          {
            header: "Valor",
            cell: (row) =>
              row.estimatedValue
                ? formatCurrency(row.estimatedValue.toString())
                : "—",
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
