import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import {
  CommercialOfferForm,
  type CommercialOfferFormValue,
} from "@/components/shared/commercial/commercial-offer-form";

function dateValue(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? "";
}

export default async function EditCommercialOfferPage({
  params,
}: {
  params: Promise<{ id: string; offerId: string }>;
}) {
  const { id, offerId } = await params;
  const { org, db } = await requireOrgContext();
  const [opportunity, offer, teamMembers, contextSources] = await Promise.all([
    db.opportunity.findUnique({
      where: { id },
      include: {
        commercialPartners: {
          include: { commercialPartner: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.commercialOffer.findFirst({
      where: { id: offerId, opportunityId: id },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        documents: { orderBy: { createdAt: "asc" } },
        profitShares: { orderBy: { createdAt: "asc" } },
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
  if (!opportunity || !offer) notFound();
  const value: CommercialOfferFormValue = {
    id: offer.id,
    status: offer.status,
    offerorName: offer.offerorName,
    presenterTeamMemberId: offer.presenterTeamMemberId,
    presenterNameSnapshot: offer.presenterNameSnapshot,
    productName: offer.productName,
    sentAt: dateValue(offer.sentAt),
    validBusinessDays: offer.validBusinessDays,
    validUntil: dateValue(offer.validUntil),
    pricingUnit: offer.pricingUnit,
    plusVat: offer.plusVat,
    exchangeRateToClp: offer.exchangeRateToClp?.toString() ?? "",
    exchangeRateDate: dateValue(offer.exchangeRateDate),
    exchangeRateSource: offer.exchangeRateSource,
    executiveSummary: offer.executiveSummary,
    painSummary: offer.painSummary,
    solutionSummary: offer.solutionSummary,
    implementationPlan: offer.implementationPlan,
    outOfScope: offer.outOfScope,
    commercialTerms: offer.commercialTerms,
    risks: offer.risks,
    nextSteps: offer.nextSteps,
    economicScope: offer.economicScope,
    economicScopeLabel: offer.economicScopeLabel,
    economicBaseNetAmount: offer.economicBaseNetAmount?.toString() ?? "",
    projectCostAmount: offer.projectCostAmount?.toString() ?? "",
    distributableProfitAmount:
      offer.distributableProfitAmount?.toString() ?? "",
    lineItems: offer.lineItems.map((item) => ({
      type: item.type,
      description: item.description,
      quantity: item.quantity ? Number(item.quantity.toString()) : undefined,
      amount: Number(item.amount.toString()),
      pricingUnit: item.pricingUnit,
      frequency: item.frequency ?? undefined,
      startMonth: item.startMonth ?? undefined,
      endMonth: item.endMonth ?? undefined,
      billingTrigger: item.billingTrigger ?? undefined,
    })),
    documents: offer.documents.map((document) => ({
      name: document.name,
      documentType: document.documentType ?? undefined,
      externalUrl: document.externalUrl ?? undefined,
      entityContextSourceId: document.entityContextSourceId ?? undefined,
      versionLabel: document.versionLabel ?? undefined,
      notes: document.notes ?? undefined,
    })),
    profitShares: offer.profitShares.map((share) => ({
      beneficiaryType: share.beneficiaryType as "organization" | "partner",
      commercialPartnerId: share.commercialPartnerId ?? undefined,
      beneficiaryNameSnapshot: share.beneficiaryNameSnapshot,
      percentage: Number(share.percentage.toString()),
    })),
  };
  return (
    <div>
      <PageHeader
        title={`${offer.status === "draft" ? "Editar" : "Ver"} oferta v${offer.versionNumber} · ${opportunity.name}`}
        description={
          offer.status === "draft"
            ? undefined
            : "Esta versión ya fue emitida y es de solo lectura. Crea una nueva versión para modificarla."
        }
      />
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
        offer={value}
        readOnly={offer.status !== "draft"}
      />
    </div>
  );
}
