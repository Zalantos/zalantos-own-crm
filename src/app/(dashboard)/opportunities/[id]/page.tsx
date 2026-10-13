import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPanel } from "@/components/shared/notes/notes-panel";
import { ActivitiesPanel } from "@/components/shared/activities/activities-panel";
import { CustomFieldsDetailSection } from "@/components/shared/custom-fields/custom-fields-detail-section";
import {
  EntityContextPanel,
  loadEntityContextData,
} from "@/components/shared/entity-context/entity-context-panel";
import { StageSelect } from "@/components/shared/kanban/stage-select";
import { CompanyTimeline } from "@/components/shared/timeline/company-timeline";
import { StatCard } from "@/components/shared/stat-card";
import { LinkifiedText } from "@/components/shared/linkified-text";
import { createFormatters, formatCurrencyValue } from "@/lib/format";
import { actorLabel, createdViaLabel } from "@/lib/traceability";
import { OpportunityCommercialPartnersPanel } from "@/components/shared/commercial/opportunity-commercial-partners-panel";
import { cloneCommercialOffer } from "@/app/(dashboard)/commercial/actions";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, db } = await requireOrgContext();

  const [opportunity, stages] = await Promise.all([
    db.opportunity.findUnique({
      where: { id },
      include: {
        company: true,
        decisionMaker: true,
        sponsor: true,
        createdBy: { select: { name: true, email: true } },
        commercialPartners: {
          include: { commercialPartner: true },
          orderBy: { createdAt: "asc" },
        },
        commercialOffers: {
          orderBy: { versionNumber: "desc" },
          include: { profitShares: { orderBy: { createdAt: "asc" } } },
        },
      },
    }),
    getOrgStages(db),
  ]);
  if (!opportunity) notFound();

  const partnerCatalog = await db.commercialPartner.findMany({
    where: { isActive: true },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });

  const formatters = createFormatters(org);
  const contextData = await loadEntityContextData(
    db,
    "opportunity",
    opportunity.id,
  );
  const createdByLabel = actorLabel(opportunity.createdBy);
  const originLabel = createdViaLabel(opportunity.createdVia);

  const isOverdue =
    opportunity.status === "open" &&
    opportunity.nextStepDueDate &&
    opportunity.nextStepDueDate < new Date();

  return (
    <div>
      <PageHeader
        title={opportunity.name}
        description={opportunity.company.name}
        actions={
          <>
            <StageSelect
              opportunityId={opportunity.id}
              currentStageId={opportunity.stageId}
              stages={stages}
            />
            <Button
              variant="secondary"
              render={<Link href={`/opportunities/${opportunity.id}/edit`} />}
            >
              Editar
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:grid-cols-4">
        <StatCard
          label="Empresa"
          value={opportunity.company.name}
          href={`/companies/${opportunity.company.id}`}
          variant="compact"
        />
        <StatCard
          label="Decisor"
          value={
            opportunity.decisionMaker
              ? `${opportunity.decisionMaker.firstName} ${opportunity.decisionMaker.lastName}`
              : "Sin definir"
          }
          href={
            opportunity.decisionMaker
              ? `/people/${opportunity.decisionMaker.id}`
              : undefined
          }
          variant="compact"
        />
        <StatCard
          label="Sponsor"
          value={
            opportunity.sponsor
              ? `${opportunity.sponsor.firstName} ${opportunity.sponsor.lastName}`
              : "Sin definir"
          }
          href={
            opportunity.sponsor
              ? `/people/${opportunity.sponsor.id}`
              : undefined
          }
          variant="compact"
        />
        <StatCard
          label="Valor estimado"
          value={
            opportunity.estimatedValue
              ? formatCurrencyValue(
                  opportunity.estimatedValue.toString(),
                  org.currency,
                  org.locale,
                )
              : "—"
          }
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-xs">Dolor principal</p>
            <p className="text-sm">
              {opportunity.mainPain ? (
                <LinkifiedText text={opportunity.mainPain} />
              ) : (
                "—"
              )}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-xs">Próximo paso</p>
            <p className="text-sm">
              {opportunity.nextStep ? (
                <LinkifiedText text={opportunity.nextStep} />
              ) : (
                "—"
              )}
              {opportunity.nextStepDueDate && (
                <span
                  className={
                    isOverdue
                      ? "text-destructive ml-2"
                      : "text-muted-foreground ml-2"
                  }
                >
                  (vence{" "}
                  {new Date(opportunity.nextStepDueDate).toLocaleDateString()})
                </span>
              )}
            </p>
            {isOverdue && (
              <Badge variant="destructive" className="mt-1">
                Vencido
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-xs">Trazabilidad</p>
            <p className="mt-2 text-sm">
              Creada por <span className="font-medium">{createdByLabel}</span>{" "}
              vía <span className="font-medium">{originLabel}</span>.
            </p>
            <dl className="mt-2 grid gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Creada por</dt>
                <dd className="text-right">{createdByLabel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Origen</dt>
                <dd className="text-right">{originLabel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Creada</dt>
                <dd className="text-right">
                  {formatters.dateTime(opportunity.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Actualizada</dt>
                <dd className="text-right">
                  {formatters.dateTime(opportunity.updatedAt)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <CustomFieldsDetailSection
          entityType="opportunity"
          entityId={opportunity.id}
        />
      </div>

      <Tabs defaultValue="activities">
        <TabsList>
          <TabsTrigger value="activities">Actividades</TabsTrigger>
          <TabsTrigger value="context">Contexto</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="partners">
            Partners ({opportunity.commercialPartners.length})
          </TabsTrigger>
          <TabsTrigger value="offers">
            Ofertas ({opportunity.commercialOffers.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="activities" className="pt-4">
          <ActivitiesPanel opportunityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="context" className="pt-4">
          <EntityContextPanel
            entityType="opportunity"
            entityId={opportunity.id}
            profile={contextData.profile}
            sources={contextData.sources}
            proposals={contextData.proposals}
            formatDateTime={formatters.dateTime}
          />
        </TabsContent>
        <TabsContent value="notes" className="pt-4">
          <NotesPanel opportunityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="timeline" className="pt-4">
          <CompanyTimeline opportunityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="partners" className="pt-4">
          <OpportunityCommercialPartnersPanel
            opportunityId={opportunity.id}
            assignments={opportunity.commercialPartners}
            catalog={partnerCatalog.map((partner) => ({
              id: partner.id,
              displayName: partner.displayName,
            }))}
          />
        </TabsContent>
        <TabsContent value="offers" className="space-y-3 pt-4">
          <Button
            render={
              <Link href={`/opportunities/${opportunity.id}/offers/new`} />
            }
          >
            Nueva oferta
          </Button>
          {opportunity.commercialOffers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Sin ofertas comerciales.
            </p>
          ) : (
            opportunity.commercialOffers.map((offer) => (
              <div key={offer.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Versión {offer.versionNumber} · {offer.status}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {offer.productName ?? "Sin producto"} ·{" "}
                      {offer.pricingUnit}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      render={
                        <Link
                          href={`/opportunities/${opportunity.id}/offers/${offer.id}`}
                        />
                      }
                    >
                      {offer.status === "draft" ? "Editar" : "Ver detalle"}
                    </Button>
                    <form action={cloneCommercialOffer.bind(null, offer.id)}>
                      <Button type="submit" variant="secondary" size="sm">
                        Nueva versión
                      </Button>
                    </form>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Costo:</span>{" "}
                    {offer.projectCostAmount?.toString() ?? "—"}{" "}
                    {offer.pricingUnit}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Utilidad:</span>{" "}
                    {offer.distributableProfitAmount?.toString() ?? "—"}{" "}
                    {offer.pricingUnit}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Precio neto:</span>{" "}
                    {offer.economicBaseNetAmount?.toString() ?? "—"}{" "}
                    {offer.pricingUnit}
                  </div>
                </div>
                {offer.profitShares.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {offer.profitShares.map((share) => (
                      <Badge key={share.id} variant="outline">
                        {share.beneficiaryNameSnapshot}:{" "}
                        {share.percentage.toString()}% ·{" "}
                        {share.amount.toString()} {offer.pricingUnit}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
