import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Person, Company } from "@prisma/client";

type PersonRow = Person & { company: Company | null };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const people = await prisma.person.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { company: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Personas"
        description="Contactos dentro de las empresas prospecto"
        actions={
          <Button render={<Link href="/people/new" />}>Nueva persona</Button>
        }
      />

      <form className="mb-4 flex gap-2">
        <Input
          type="search"
          name="q"
          placeholder="Buscar por nombre o email..."
          defaultValue={q}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <DataTable<PersonRow>
        rows={people}
        rowHref={(row) => `/people/${row.id}`}
        emptyMessage="Todavía no hay personas cargadas."
        columns={[
          {
            header: "Nombre",
            cell: (row) => `${row.firstName} ${row.lastName}`,
          },
          { header: "Empresa", cell: (row) => row.company?.name ?? "—" },
          { header: "Cargo", cell: (row) => row.roleTitle ?? "—" },
          {
            header: "Rol",
            cell: (row) => (
              <div className="flex gap-1">
                {row.isDecisionMaker && (
                  <Badge variant="outline">Decisor</Badge>
                )}
                {row.isSponsor && <Badge variant="outline">Sponsor</Badge>}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
