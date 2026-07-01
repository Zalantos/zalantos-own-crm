import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SavedViewSelector } from "@/components/shared/saved-view-selector";
import type { Company } from "@prisma/client";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; industry?: string; status?: string }>;
}) {
  const { q, industry, status } = await searchParams;

  const companies = await prisma.company.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      ...(industry ? { industry: { equals: industry } } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const industries = await prisma.company.findMany({
    distinct: ["industry"],
    select: { industry: true },
    where: { industry: { not: null } },
  });

  const savedViews = await prisma.savedView.findMany({
    where: { entityType: "company" },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Empresas"
        description="Cuentas y prospectos comerciales de Zalantos"
        actions={
          <Button render={<Link href="/companies/new" />}>Nueva empresa</Button>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          name="q"
          placeholder="Buscar por nombre..."
          defaultValue={q}
          className="max-w-xs"
        />
        <select
          name="industry"
          defaultValue={industry ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todas las industrias</option>
          {industries.map(
            (item) =>
              item.industry && (
                <option key={item.industry} value={item.industry}>
                  {item.industry}
                </option>
              ),
          )}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="churned">churned</option>
        </select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <div className="mb-4">
        <SavedViewSelector
          entityType="company"
          basePath="/companies"
          savedViews={savedViews}
        />
      </div>

      <DataTable<Company>
        rows={companies}
        rowHref={(row) => `/companies/${row.id}`}
        emptyMessage="Todavía no hay empresas cargadas."
        columns={[
          { header: "Nombre", cell: (row) => row.name },
          { header: "Industria", cell: (row) => row.industry ?? "—" },
          { header: "País", cell: (row) => row.country ?? "—" },
          {
            header: "Estado",
            cell: (row) => <Badge variant="outline">{row.status}</Badge>,
          },
        ]}
      />
    </div>
  );
}
