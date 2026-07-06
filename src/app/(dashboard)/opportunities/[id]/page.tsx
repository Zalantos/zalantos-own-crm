import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
import { formatCurrency } from "@/lib/currency";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: { company: true, decisionMaker: true, sponsor: true },
  });
  if (!opportunity) notFound();

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
              currentStage={opportunity.stage}
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
              ? formatCurrency(opportunity.estimatedValue.toString())
              : "—"
          }
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
