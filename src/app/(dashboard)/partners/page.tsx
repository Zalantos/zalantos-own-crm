import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { getActiveOrgUsers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewPartnerButton } from "@/components/shared/partners/partner-forms";
import { partnerTypeLabel } from "@/lib/commercial/partners";
import { actorLabel } from "@/lib/traceability";

const partnerSelect = {
  id: true,
  displayName: true,
  isActive: true,
  allianceType: true,
  agreementTerms: true,
  owner: { select: { name: true, email: true } },
  linkedCompany: { select: { name: true } },
  linkedPerson: { select: { firstName: true, lastName: true } },
  actorLinks: { select: { opportunityId: true, commercialLeadId: true } },
} satisfies Prisma.CommercialPartnerSelect;

type PartnerRow = Prisma.CommercialPartnerGetPayload<{ select: typeof partnerSelect }>;

// Directorio de relaciones comerciales. Los negocios de un partner corren por
// el pipeline normal de prospección y oportunidades.
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const { db } = await requireOrgContext();
  const search = q?.trim();
  const showInactive = status === "inactive";
  const [partners, companies, people, users] = await Promise.all([
    db.commercialPartner.findMany({
      where: {
        isActive: !showInactive,
        ...(search ? { displayName: { contains: search, mode: "insensitive" } } : {}),
      },
      select: partnerSelect,
      orderBy: { displayName: "asc" },
    }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.person.findMany({ orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    getActiveOrgUsers(db),
  ]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Partners"
        description="Directorio de relaciones comerciales: acuerdos, contactos y negocios en los que participan."
        actions={
          <NewPartnerButton
            companies={companies.map((company) => ({ id: company.id, label: company.name }))}
            people={people.map((person) => ({ id: person.id, label: `${person.firstName} ${person.lastName}` }))}
            users={users.map((user) => ({ id: user.id, label: user.name ?? user.email }))}
          />
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={search ?? ""} placeholder="Buscar partner" className="w-full sm:w-64" />
        {showInactive && <input type="hidden" name="status" value="inactive" />}
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        <Link
          href={showInactive ? "/partners" : "/partners?status=inactive"}
          className="text-muted-foreground text-sm hover:underline"
        >
          {showInactive ? "Ver activos" : "Ver inactivos"}
        </Link>
      </form>

      <DataTable<PartnerRow>
        rows={partners}
        rowHref={(row) => `/partners/${row.id}`}
        emptyMessage="No hay partners con estos filtros."
        columns={[
          { header: "Partner", cell: (row) => <span className="font-medium">{row.displayName}</span> },
          { header: "Tipo", cell: (row) => partnerTypeLabel(row.allianceType) },
          {
            header: "Vinculado a",
            cell: (row) =>
              row.linkedCompany?.name ??
              (row.linkedPerson ? `${row.linkedPerson.firstName} ${row.linkedPerson.lastName}` : "—"),
          },
          { header: "Responsable", cell: (row) => (row.owner ? actorLabel(row.owner) : "—") },
          { header: "Prospectos", cell: (row) => row.actorLinks.filter((link) => link.commercialLeadId).length },
          { header: "Oportunidades", cell: (row) => row.actorLinks.filter((link) => link.opportunityId).length },
          {
            header: "Acuerdo",
            cell: (row) => (row.agreementTerms ? <Badge variant="outline">Registrado</Badge> : "—"),
          },
        ]}
      />
    </div>
  );
}
