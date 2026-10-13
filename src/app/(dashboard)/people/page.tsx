import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type {
  Person,
  Company,
  PersonCompanyRelationship,
} from "@prisma/client";

type PersonRow = Person & {
  companyRelationships: Array<PersonCompanyRelationship & { company: Company }>;
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { db } = await requireOrgContext();

  const people = await db.person.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      companyRelationships: {
        where: { endedAt: null },
        include: { company: true },
        orderBy: { isPrimary: "desc" },
      },
    },
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
          {
            header: "Empresas",
            cell: (row) => {
              const primary = row.companyRelationships.find(
                (relationship) => relationship.isPrimary,
              );
              const additional =
                row.companyRelationships.length - (primary ? 1 : 0);
              return primary
                ? `${primary.company.name}${additional > 0 ? ` +${additional}` : ""}`
                : "—";
            },
          },
          {
            header: "Cargo",
            cell: (row) =>
              row.companyRelationships.find(
                (relationship) => relationship.isPrimary,
              )?.roleTitle ?? "—",
          },
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
