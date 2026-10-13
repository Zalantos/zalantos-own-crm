import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { CommercialOfferForm } from "@/components/shared/commercial/commercial-offer-form";

export default async function NewCommercialOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, db } = await requireOrgContext();
  const [opportunity, teamMembers, contextSources] = await Promise.all([
    db.opportunity.findUnique({
      where: { id },
      include: {
        commercialPartners: {
          include: { commercialPartner: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.teamMember.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    db.entityContextSource.findMany({
      where: { entityType: "opportunity", entityId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, filename: true },
    }),
  ]);
  if (!opportunity) notFound();
  return (
    <div>
      <PageHeader title={`Nueva oferta · ${opportunity.name}`} />
      <CommercialOfferForm
        opportunityId={opportunity.id}
        organizationName={org.brandName ?? org.name}
        teamMembers={teamMembers.map(({ id, name }) => ({ id, name }))}
        partners={opportunity.commercialPartners.map((assignment) => ({
          id: assignment.commercialPartnerId,
          name: assignment.commercialPartner.displayName,
          defaultPercentage: Number(
            assignment.profitSharePercentage?.toString() ?? 0,
          ),
        }))}
        contextSources={contextSources.map((source) => ({
          id: source.id,
          name: source.filename,
        }))}
      />
    </div>
  );
}
