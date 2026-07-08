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
import { StageSelect } from "@/components/shared/kanban/stage-select";
import { CompanyTimeline } from "@/components/shared/timeline/company-timeline";
import { StatCard } from "@/components/shared/stat-card";
import { createFormatters, formatCurrencyValue } from "@/lib/format";

const CREATED_VIA_LABELS: Record<string, string> = {
  manual: "Formulario manual",
  notion_import: "Importación Notion",
  seed: "Datos demo",
  legacy: "Registro previo",
};

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
      },
    }),
    getOrgStages(db),
  ]);
  if (!opportunity) notFound();

  const formatters = createFormatters(org);
  const createdByLabel =
    opportunity.createdBy?.name ??
    opportunity.createdBy?.email ??
    "Sistema / desconocido";
  const createdViaLabel =
    CREATED_VIA_LABELS[opportunity.createdVia] ?? opportunity.createdVia;

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
              ? formatCurrencyValue(opportunity.estimatedValue.toString(), org.currency, org.locale)
              : "—"
          }
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-xs">Dolor principal</p>
            <p className="text-sm">{opportunity.mainPain || "—"}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-xs">Próximo paso</p>
            <p className="text-sm">
              {opportunity.nextStep || "—"}
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
            <dl className="mt-2 grid gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Creada por</dt>
                <dd className="text-right">{createdByLabel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Origen</dt>
                <dd className="text-right">{createdViaLabel}</dd>
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
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="activities" className="pt-4">
          <ActivitiesPanel opportunityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="notes" className="pt-4">
          <NotesPanel opportunityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="timeline" className="pt-4">
          <CompanyTimeline opportunityId={opportunity.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
