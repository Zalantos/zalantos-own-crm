import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPanel } from "@/components/shared/notes/notes-panel";
import { ActivitiesPanel } from "@/components/shared/activities/activities-panel";
import { CustomFieldsDetailSection } from "@/components/shared/custom-fields/custom-fields-detail-section";
import {
  EntityContextPanel,
  loadEntityContextData,
} from "@/components/shared/entity-context/entity-context-panel";
import { StatCard } from "@/components/shared/stat-card";
import { OpportunityStageBadge } from "@/components/shared/opportunities/status-badge";
import { createFormatters } from "@/lib/format";
import { actorLabel, createdViaLabel } from "@/lib/traceability";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, db } = await requireOrgContext();

  const stageInclude = {
    stage: { select: { label: true, isWon: true, isLost: true } },
  } as const;
  const person = await db.person.findUnique({
    where: { id },
    include: {
      company: true,
      createdBy: { select: { name: true, email: true } },
      opportunitiesAsDecisionMaker: { include: stageInclude },
      opportunitiesAsSponsor: { include: stageInclude },
    },
  });
  if (!person) notFound();
  const formatters = createFormatters(org);
  const contextData = await loadEntityContextData(db, "person", person.id);

  const relatedOpportunities = [
    ...person.opportunitiesAsDecisionMaker.map((opportunity) => ({
      opportunity,
      role: "Decisor",
    })),
    ...person.opportunitiesAsSponsor.map((opportunity) => ({
      opportunity,
      role: "Sponsor",
    })),
  ];

  return (
    <div>
      <PageHeader
        title={`${person.firstName} ${person.lastName}`}
        description={[person.roleTitle, person.company?.name]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {person.isDecisionMaker && <Badge variant="outline">Decisor</Badge>}
            {person.isSponsor && <Badge variant="outline">Sponsor</Badge>}
            <Button
              variant="secondary"
              render={<Link href={`/people/${person.id}/edit`} />}
            >
              Editar
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Email" value={person.email} variant="compact" />
        <StatCard label="Teléfono" value={person.phone} variant="compact" />
        <StatCard
          label="Empresa"
          value={person.company?.name}
          href={person.companyId ? `/companies/${person.companyId}` : undefined}
          variant="compact"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Creada por"
          value={actorLabel(person.createdBy)}
          variant="compact"
        />
        <StatCard
          label="Origen"
          value={createdViaLabel(person.createdVia)}
          variant="compact"
        />
        <StatCard
          label="Creada"
          value={formatters.dateTime(person.createdAt)}
          variant="compact"
        />
      </div>

      {person.notes && (
        <p className="text-muted-foreground mb-6 max-w-3xl text-sm">
          {person.notes}
        </p>
      )}

      <div className="mb-6">
        <CustomFieldsDetailSection entityType="person" entityId={person.id} />
      </div>

      <Tabs defaultValue="opportunities">
        <TabsList>
          <TabsTrigger value="opportunities">
            Oportunidades ({relatedOpportunities.length})
          </TabsTrigger>
          <TabsTrigger value="context">Contexto</TabsTrigger>
          <TabsTrigger value="activities">Actividades</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
        </TabsList>

        <TabsContent value="opportunities" className="space-y-2 pt-4">
          {relatedOpportunities.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No participa en oportunidades todavía.
            </p>
          ) : (
            relatedOpportunities.map(({ opportunity, role }) => (
              <Link
                key={`${role}-${opportunity.id}`}
                href={`/opportunities/${opportunity.id}`}
                className="hover:bg-muted/50 flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <span>{opportunity.name}</span>
                <span className="flex gap-1">
                  <Badge variant="outline">{role}</Badge>
                  <OpportunityStageBadge stage={opportunity.stage} />
                </span>
              </Link>
            ))
          )}
        </TabsContent>

        <TabsContent value="context" className="pt-4">
          <EntityContextPanel
            entityType="person"
            entityId={person.id}
            profile={contextData.profile}
            sources={contextData.sources}
            proposals={contextData.proposals}
            formatDateTime={formatters.dateTime}
          />
        </TabsContent>

        <TabsContent value="activities" className="pt-4">
          <ActivitiesPanel personId={person.id} />
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <NotesPanel personId={person.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
