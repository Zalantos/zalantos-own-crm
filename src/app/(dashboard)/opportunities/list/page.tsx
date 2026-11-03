import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { getAllOrgStages } from "@/lib/pipeline/stages";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SavedViewSelector } from "@/components/shared/saved-view-selector";
import { OpportunityStatusBadge } from "@/components/shared/opportunities/status-badge";
import { formatCurrencyValue } from "@/lib/format";
import { actorLabel } from "@/lib/traceability";
import { getActiveOrgUsers } from "@/lib/team";
import {
  LOSS_REASONS,
  LOSS_REASON_LABELS,
  isLossReason,
} from "@/lib/opportunities/loss-reason";
import { OPPORTUNITY_STATUSES, OPPORTUNITY_STATUS_LABELS, isOpportunityStatus } from "@/lib/opportunities/status";
import { nextActionState } from "@/lib/commercial/next-action";

type SearchParams = {
  q?: string;
  stage?: string;
  urgency?: string;
  status?: string;
  overdue?: string;
  noNext?: string;
  review?: string;
  partnerId?: string;
  offerStatus?: string;
  offerExpiry?: string;
  ownerId?: string;
  lossReason?: string;
  sort?: string;
};

const SORTS: Record<string, { label: string; orderBy: Prisma.OpportunityOrderByWithRelationInput[] }> = {
  next: { label: "Próxima acción", orderBy: [{ nextStepDueDate: { sort: "asc", nulls: "first" } }] },
  stage: { label: "Etapa", orderBy: [{ stage: { sortOrder: "asc" } }, { nextStepDueDate: { sort: "asc", nulls: "first" } }] },
  probability: { label: "Probabilidad", orderBy: [{ probability: { sort: "desc", nulls: "last" } }] },
  value: { label: "Monto", orderBy: [{ estimatedValue: { sort: "desc", nulls: "last" } }] },
  close: { label: "Cierre esperado", orderBy: [{ expectedCloseDate: { sort: "asc", nulls: "last" } }] },
  created: { label: "Más recientes", orderBy: [{ createdAt: "desc" }] },
  owner: { label: "Responsable", orderBy: [{ owner: { name: "asc" } }] },
};

const selectClass = "bg-background h-9 rounded-md border px-2 text-sm";

function formatOfferAmount(value: Prisma.Decimal | null, pricingUnit: string, locale: string) {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value.toNumber())} ${pricingUnit}`;
}

export default async function OpportunitiesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { q, stage, urgency, status, overdue, noNext, review, partnerId, offerStatus, offerExpiry, ownerId, lossReason } = params;
  const sort = params.sort && SORTS[params.sort] ? params.sort : "next";
  const { org, db, user } = await requireOrgContext();
  const [savedViews, stages, partners, users] = await Promise.all([
    db.savedView.findMany({ where: { entityType: "opportunity" }, orderBy: { name: "asc" } }),
    getAllOrgStages(db),
    db.commercialPartner.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
    getActiveOrgUsers(db),
  ]);
  const now = new Date();
  const search = q?.trim();

  const where: Prisma.OpportunityWhereInput = {
    ...(stage ? { stageId: stage } : {}),
    ...(urgency ? { urgency } : {}),
    // Sin filtro explícito no se muestran registros legacy archivados.
    ...(status && isOpportunityStatus(status) ? { status } : { status: { not: "archived" } }),
    ...(ownerId === "me" ? { ownerId: user.id } : ownerId === "none" ? { ownerId: null } : ownerId ? { ownerId } : {}),
    ...(lossReason && isLossReason(lossReason) ? { lossReason } : {}),
    ...(overdue === "1" ? { nextStepDueDate: { lt: now }, status: "open" } : {}),
    ...(noNext === "1" ? { status: "open", OR: [{ nextStep: null }, { nextStepDueDate: null }] } : {}),
    ...(review === "1" ? { migrationReview: { not: null } } : {}),
    ...(partnerId ? { commercialPartners: { some: { commercialPartnerId: partnerId } } } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { company: { name: { contains: search, mode: "insensitive" } } },
                { nextStep: { contains: search, mode: "insensitive" } },
              ],
            },
          ],
        }
      : {}),
  };

  const allOpportunities = await db.opportunity.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { name: true, email: true } },
      stage: { select: { label: true, isActive: true } },
      commercialOffers: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { profitShares: true },
      },
    },
    orderBy: SORTS[sort].orderBy,
    take: 500,
  });
  const opportunities = allOpportunities.filter((opportunity) => {
    const offer = opportunity.commercialOffers[0];
    if (offerStatus && offer?.status !== offerStatus) return false;
    if (offerExpiry === "expired") return Boolean(offer?.validUntil && offer.validUntil < now);
    if (offerExpiry === "active") return Boolean(offer?.validUntil && offer.validUntil >= now);
    return true;
  });
  type Row = (typeof opportunities)[number];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Oportunidades"
        description={`${opportunities.length} resultado${opportunities.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Button variant="secondary" render={<Link href="/opportunities" />}>
              Ver kanban
            </Button>
            <Button render={<Link href="/opportunities/new" />}>Nueva oportunidad</Button>
          </>
        }
      />

      <form className="mb-3 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={search ?? ""} placeholder="Buscar negocio, empresa o acción" className="w-full sm:w-64" />
        <select name="status" defaultValue={status ?? ""} className={selectClass}>
          <option value="">Abiertas, pausadas y cerradas</option>
          {OPPORTUNITY_STATUSES.map((value) => (
            <option key={value} value={value}>
              {OPPORTUNITY_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={stage ?? ""} className={selectClass}>
          <option value="">Toda etapa</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.isActive ? s.label : `${s.label} (retirada)`}
            </option>
          ))}
        </select>
        <select name="ownerId" defaultValue={ownerId ?? ""} className={selectClass}>
          <option value="">Todo responsable</option>
          <option value="me">Mis oportunidades</option>
          <option value="none">Sin responsable</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className={selectClass}>
          {Object.entries(SORTS).map(([value, option]) => (
            <option key={value} value={value}>
              Ordenar: {option.label}
            </option>
          ))}
        </select>
        <details className="w-full sm:w-auto">
          <summary className="text-muted-foreground cursor-pointer text-sm">Más filtros</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select name="urgency" defaultValue={urgency ?? ""} className={selectClass}>
              <option value="">Toda urgencia</option>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
            <select name="lossReason" defaultValue={lossReason ?? ""} className={selectClass}>
              <option value="">Todo motivo de pérdida</option>
              {LOSS_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {LOSS_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
            <select name="partnerId" defaultValue={partnerId ?? ""} className={selectClass}>
              <option value="">Todo partner</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.displayName}
                </option>
              ))}
            </select>
            <select name="offerStatus" defaultValue={offerStatus ?? ""} className={selectClass}>
              <option value="">Toda oferta</option>
              <option value="draft">Borrador</option>
              <option value="sent">Enviada</option>
              <option value="accepted">Aceptada</option>
              <option value="rejected">Rechazada</option>
              <option value="expired">Expirada</option>
              <option value="superseded">Reemplazada</option>
            </select>
            <select name="offerExpiry" defaultValue={offerExpiry ?? ""} className={selectClass}>
              <option value="">Toda vigencia</option>
              <option value="active">Vigente</option>
              <option value="expired">Vencida</option>
            </select>
          </div>
        </details>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={overdue === "1"} />
          Acción vencida
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="noNext" value="1" defaultChecked={noNext === "1"} />
          Sin próxima acción
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="review" value="1" defaultChecked={review === "1"} />
          Requieren revisión
        </label>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <div className="mb-4">
        <SavedViewSelector entityType="opportunity" basePath="/opportunities/list" savedViews={savedViews} />
      </div>

      <DataTable<Row>
        rows={opportunities}
        rowHref={(row) => `/opportunities/${row.id}`}
        emptyMessage="No hay oportunidades con estos filtros."
        columns={[
          {
            header: "Negocio",
            cell: (row) => (
              <span className="space-y-0.5">
                <span className="block font-medium">{row.name}</span>
                {row.migrationReview && (
                  <Badge variant="outline" className="text-amber-600">
                    Revisar migración
                  </Badge>
                )}
              </span>
            ),
          },
          { header: "Empresa", cell: (row) => row.company.name },
          {
            header: "Etapa",
            cell: (row) => (row.stage.isActive ? row.stage.label : `${row.stage.label} (retirada)`),
          },
          { header: "Estado", cell: (row) => <OpportunityStatusBadge status={row.status} /> },
          {
            header: "Monto",
            cell: (row) =>
              row.estimatedValue
                ? formatCurrencyValue(row.estimatedValue.toString(), org.currency, org.locale)
                : "—",
          },
          { header: "Prob.", cell: (row) => (row.probability != null ? `${row.probability}%` : "—") },
          {
            header: "Próxima acción",
            cell: (row) => {
              if (row.status !== "open") return row.nextStep ?? "—";
              const state = nextActionState(row.nextStep, row.nextStepDueDate, now);
              if (state === "missing") return <span className="text-amber-600">Sin definir</span>;
              return (
                <span className={state === "overdue" ? "text-destructive" : undefined}>
                  {row.nextStepDueDate ? `${row.nextStepDueDate.toISOString().slice(0, 10)} · ` : "Sin fecha · "}
                  {row.nextStep}
                </span>
              );
            },
          },
          { header: "Responsable", cell: (row) => (row.owner ? actorLabel(row.owner) : "—") },
          {
            header: "Oferta",
            cell: (row) => {
              const offer = row.commercialOffers[0];
              return offer
                ? `v${offer.versionNumber} · ${offer.status} · ${formatOfferAmount(offer.economicBaseNetAmount, offer.pricingUnit, org.locale)}`
                : "—";
            },
          },
        ]}
      />
    </div>
  );
}
