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
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/zod/opportunity";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      company: true,
      opportunitiesAsDecisionMaker: true,
      opportunitiesAsSponsor: true,
    },
  });
  if (!person) notFound();

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

      <div className="mb-6 grid grid-cols-3 gap-4 text-sm">
        <InfoRow label="Email" value={person.email} />
        <InfoRow label="Teléfono" value={person.phone} />
        <InfoRow
          label="Empresa"
          value={person.company?.name}
          href={person.companyId ? `/companies/${person.companyId}` : undefined}
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
                  <Badge variant="outline">
                    {OPPORTUNITY_STAGE_LABELS[opportunity.stage]}
                  </Badge>
                </span>
              </Link>
            ))
          )}
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

function InfoRow({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href?: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      {href && value ? (
        <Link href={href} className="text-sm underline">
          {value}
        </Link>
      ) : (
        <p className="text-sm">{value ?? "—"}</p>
      )}
    </div>
  );
}
