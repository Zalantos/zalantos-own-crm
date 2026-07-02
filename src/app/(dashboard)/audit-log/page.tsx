import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActivityFeed, TYPE_LABELS } from "@/lib/timeline";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SearchParams = {
  type?: string;
  actorId?: string;
  companyId?: string;
  from?: string;
  to?: string;
  page?: string;
};

function buildQuery(params: SearchParams, overrides: Partial<SearchParams>) {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) query.set(key, value);
  }
  return `/audit-log?${query.toString()}`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = params.page ? Number(params.page) : 1;

  const [{ events, total, pageCount }, users, companies] = await Promise.all([
    getActivityFeed({
      type: params.type || undefined,
      actorId: params.actorId || undefined,
      companyId: params.companyId || undefined,
      from: params.from ? new Date(`${params.from}T00:00:00`) : undefined,
      to: params.to ? new Date(`${params.to}T23:59:59`) : undefined,
      page,
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Actividad"
        description="Registro de reuniones, evidencias y revisiones hechas por el equipo"
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="actorId"
          defaultValue={params.actorId ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todos los usuarios</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name ?? user.email}
            </option>
          ))}
        </select>
        <select
          name="companyId"
          defaultValue={params.companyId ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todas las empresas</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={params.from ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={params.to ?? ""}
          className="bg-background h-9 rounded-md border px-3 text-sm"
        />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <DataTable
        rows={events}
        rowHref={(row) =>
          row.refType === "meeting" || row.refType === "proposal"
            ? `/meetings/${row.refId}`
            : undefined
        }
        emptyMessage="Todavía no hay actividad registrada."
        columns={[
          {
            header: "Fecha",
            cell: (row) => formatDateTime(row.occurredAt),
          },
          {
            header: "Tipo",
            cell: (row) => (
              <Badge variant="outline">
                {TYPE_LABELS[row.type] ?? row.type}
              </Badge>
            ),
          },
          {
            header: "Detalle",
            cell: (row) => (
              <div>
                <p className="font-medium">{row.title}</p>
                {row.summary && (
                  <p className="text-muted-foreground text-sm">
                    {row.summary}
                  </p>
                )}
              </div>
            ),
          },
          {
            header: "Empresa",
            cell: (row) => row.company?.name ?? "—",
          },
          {
            header: "Usuario",
            cell: (row) => row.actor?.name ?? row.actor?.email ?? "—",
          },
        ]}
      />

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {total} evento(s) · página {page} de {pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              render={
                <Link
                  href={buildQuery(params, { page: String(page - 1) })}
                  scroll={false}
                />
              }
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pageCount}
              render={
                <Link
                  href={buildQuery(params, { page: String(page + 1) })}
                  scroll={false}
                />
              }
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
