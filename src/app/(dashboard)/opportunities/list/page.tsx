import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
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
import { StageVisibilityMenu } from "@/components/shared/opportunities/stage-visibility-menu";
import { OpportunityStageBadge } from "@/components/shared/opportunities/status-badge";
import {
  knownHiddenStageIds,
  opportunityStageWhere,
} from "@/lib/opportunities/hidden-stages";
import { readHiddenStageIds } from "@/lib/opportunities/read-hidden-stages";
import { formatCurrencyValue } from "@/lib/format";
import { Prisma } from "@prisma/client";

type OpportunityRow = Prisma.OpportunityGetPayload<{
  include: {
    company: true;
    stage: { select: { label: true; isWon: true; isLost: true } };
    commercialPartners: {
      include: { commercialPartner: { select: { displayName: true } } };
    };
    commercialOffers: {
      include: { profitShares: true };
    };
  };
}>;

function formatOfferAmount(
  value: Prisma.Decimal | null,
  pricingUnit: string,
  locale: string,
) {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(
    value.toNumber(),
  )} ${pricingUnit}`;
}

export default async function OpportunitiesListPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    urgency?: string;
    status?: string;
    overdue?: string;
    partnerId?: string;
    offerStatus?: string;
    offerExpiry?: string;
  }>;
}) {
  const {
    stage,
    urgency,
    status,
    overdue,
    partnerId,
    offerStatus,
    offerExpiry,
  } = await searchParams;
  const { org, db } = await requireOrgContext();
  const [savedViews, stages, hiddenRaw, partners] = await Promise.all([
    db.savedView.findMany({
      where: { entityType: "opportunity" },
      orderBy: { name: "asc" },
    }),
    getOrgStages(db),
    readHiddenStageIds(),
    db.commercialPartner.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);
  const hiddenStageIds = knownHiddenStageIds(hiddenRaw, stages);

  const allOpportunities = await db.opportunity.findMany({
    where: {
      ...opportunityStageWhere(hiddenStageIds, stage),
      ...(urgency ? { urgency } : {}),
      ...(status ? { status } : {}),
      ...(overdue === "1"
        ? { nextStepDueDate: { lt: new Date() }, status: "open" }
        : {}),
      ...(partnerId
        ? { commercialPartners: { some: { commercialPartnerId: partnerId } } }
        : {}),
    },
    include: {
      company: true,
      stage: { select: { label: true, isWon: true, isLost: true } },
      commercialPartners: {
        include: { commercialPartner: { select: { displayName: true } } },
      },
      commercialOffers: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { profitShares: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  const opportunities = allOpportunities.filter((opportunity) => {
    const offer = opportunity.commercialOffers[0];
    if (offerStatus && offer?.status !== offerStatus) return false;
    if (offerExpiry === "expired") {
      return Boolean(offer?.validUntil && offer.validUntil < now);
    }
    if (offerExpiry === "active") {
      return Boolean(offer?.validUntil && offer.validUntil >= now);
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Oportunidades"
        actions={
          <>
            <StageVisibilityMenu
              stages={stages}
              hiddenStageIds={hiddenStageIds}
            />
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
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {hiddenStageIds.includes(s.id)
                  ? `${s.label} (oculta)`
                  : s.label}
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
        <Select name="partnerId" defaultValue={partnerId ?? ""}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todo partner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todo partner</SelectItem>
            {partners.map((partner) => (
              <SelectItem key={partner.id} value={partner.id}>
                {partner.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="offerStatus" defaultValue={offerStatus ?? ""}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado de oferta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Toda oferta</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="accepted">Aceptada</SelectItem>
            <SelectItem value="rejected">Rechazada</SelectItem>
            <SelectItem value="expired">Expirada</SelectItem>
            <SelectItem value="superseded">Reemplazada</SelectItem>
          </SelectContent>
        </Select>
        <Select name="offerExpiry" defaultValue={offerExpiry ?? ""}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Vigencia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Toda vigencia</SelectItem>
            <SelectItem value="active">Vigente</SelectItem>
            <SelectItem value="expired">Vencida</SelectItem>
          </SelectContent>
        </Select>
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
                ? formatCurrencyValue(
                    row.estimatedValue.toString(),
                    org.currency,
                    org.locale,
                  )
                : "—",
          },
          {
            header: "Partner",
            cell: (row) =>
              row.commercialPartners
                .map((assignment) => assignment.commercialPartner.displayName)
                .join(", ") || "—",
          },
          {
            header: "Oferta",
            cell: (row) => {
              const offer = row.commercialOffers[0];
              return offer ? `v${offer.versionNumber} · ${offer.status}` : "—";
            },
          },
          {
            header: "Precio neto",
            cell: (row) => {
              const offer = row.commercialOffers[0];
              return offer
                ? formatOfferAmount(
                    offer.economicBaseNetAmount,
                    offer.pricingUnit,
                    org.locale,
                  )
                : "—";
            },
          },
          {
            header: "Costo / utilidad",
            cell: (row) => {
              const offer = row.commercialOffers[0];
              if (!offer) return "—";
              return `${formatOfferAmount(offer.projectCostAmount, offer.pricingUnit, org.locale)} / ${formatOfferAmount(offer.distributableProfitAmount, offer.pricingUnit, org.locale)}`;
            },
          },
          {
            header: "Zalantos / partners",
            cell: (row) => {
              const offer = row.commercialOffers[0];
              if (!offer) return "—";
              const zalantos = offer.profitShares
                .filter((share) => share.beneficiaryType === "organization")
                .reduce((sum, share) => sum + share.amount.toNumber(), 0);
              const partnerTotal = offer.profitShares
                .filter((share) => share.beneficiaryType === "partner")
                .reduce((sum, share) => sum + share.amount.toNumber(), 0);
              return `${formatOfferAmount(
                new Prisma.Decimal(zalantos),
                offer.pricingUnit,
                org.locale,
              )} / ${formatOfferAmount(
                new Prisma.Decimal(partnerTotal),
                offer.pricingUnit,
                org.locale,
              )}`;
            },
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
