import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPanel } from "@/components/shared/notes/notes-panel";
import { ActivitiesPanel } from "@/components/shared/activities/activities-panel";
import { CustomFieldsDetailSection } from "@/components/shared/custom-fields/custom-fields-detail-section";
import { StageSelect } from "@/components/shared/kanban/stage-select";

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

      <div className="mb-6 grid grid-cols-4 gap-4">
        <InfoCard
          label="Empresa"
          value={opportunity.company.name}
          href={`/companies/${opportunity.company.id}`}
        />
        <InfoCard
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
        />
        <InfoCard
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
        />
        <InfoCard
          label="Valor estimado"
          value={
            opportunity.estimatedValue
              ? `$${opportunity.estimatedValue.toString()}`
              : "—"
          }
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground text-xs">Dolor principal</p>
          <p className="text-sm">{opportunity.mainPain || "—"}</p>
        </div>
        <div className="rounded-md border p-3">
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
        </div>
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
        </TabsList>
        <TabsContent value="activities" className="pt-4">
          <ActivitiesPanel opportunityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="notes" className="pt-4">
          <NotesPanel opportunityId={opportunity.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      {href ? (
        <Link href={href} className="text-sm underline">
          {value}
        </Link>
      ) : (
        <p className="text-sm">{value}</p>
      )}
    </div>
  );
}
