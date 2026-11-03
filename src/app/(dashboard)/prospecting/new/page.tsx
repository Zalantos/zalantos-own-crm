import { requireOrgContext } from "@/lib/tenant";
import { getActiveOrgUsers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { LeadCreateForm } from "@/components/shared/prospecting/lead-create-form";

export default async function NewProspectPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; personId?: string; referrerPartnerId?: string }>;
}) {
  const defaults = await searchParams;
  const { db, user } = await requireOrgContext();
  const [companies, people, users, campaigns, partners] = await Promise.all([
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.person.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, company: { select: { name: true } } },
    }),
    getActiveOrgUsers(db),
    db.campaign.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.commercialPartner.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Nuevo prospecto"
        description="Empresa o persona potencialmente interesante. No necesita haber mostrado interés ni tener oportunidad."
      />
      <LeadCreateForm
        companies={companies.map((company) => ({ id: company.id, label: company.name }))}
        people={people.map((person) => ({
          id: person.id,
          label: `${person.firstName} ${person.lastName}${person.company ? ` · ${person.company.name}` : ""}`,
        }))}
        users={users.map((member) => ({ id: member.id, label: member.name ?? member.email }))}
        campaigns={campaigns.map((campaign) => ({ id: campaign.id, label: campaign.name }))}
        partners={partners.map((partner) => ({ id: partner.id, label: partner.displayName }))}
        currentUserId={user.id}
        defaults={defaults}
      />
    </div>
  );
}
