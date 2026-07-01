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

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      people: { orderBy: { createdAt: "desc" } },
      opportunities: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!company) notFound();

  return (
    <div>
      <PageHeader
        title={company.name}
        description={[company.industry, company.country]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Badge variant="outline">{company.status}</Badge>
            <Button
              variant="secondary"
              render={<Link href={`/companies/${company.id}/edit`} />}
            >
              Editar
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Stat label="ICP score" value={company.icpScore} />
        <Stat label="Fit score" value={company.fitScore} />
        <Stat label="Pain score" value={company.painScore} />
        <Stat label="Sitio web" value={company.website ?? "—"} isText />
      </div>

      {company.description && (
        <p className="text-muted-foreground mb-6 max-w-3xl text-sm">
          {company.description}
        </p>
      )}

      <div className="mb-6">
        <CustomFieldsDetailSection entityType="company" entityId={company.id} />
      </div>

      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">
            Personas ({company.people.length})
          </TabsTrigger>
          <TabsTrigger value="opportunities">
            Oportunidades ({company.opportunities.length})
          </TabsTrigger>
          <TabsTrigger value="activities">Actividades</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="space-y-3 pt-4">
          <Button
            size="sm"
            variant="secondary"
            render={<Link href={`/people/new?companyId=${company.id}`} />}
          >
            Nueva persona
          </Button>
          {company.people.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Sin personas registradas.
            </p>
          ) : (
            <div className="space-y-2">
              {company.people.map((person) => (
                <Link
                  key={person.id}
                  href={`/people/${person.id}`}
                  className="hover:bg-muted/50 flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <span>
                    {person.firstName} {person.lastName}
                    {person.roleTitle && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {person.roleTitle}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-1">
                    {person.isDecisionMaker && (
                      <Badge variant="outline">Decisor</Badge>
                    )}
                    {person.isSponsor && (
                      <Badge variant="outline">Sponsor</Badge>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-3 pt-4">
          <Button
            size="sm"
            variant="secondary"
            render={
              <Link href={`/opportunities/new?companyId=${company.id}`} />
            }
          >
            Nueva oportunidad
          </Button>
          {company.opportunities.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Sin oportunidades registradas.
            </p>
          ) : (
            <div className="space-y-2">
              {company.opportunities.map((opportunity) => (
                <Link
                  key={opportunity.id}
                  href={`/opportunities/${opportunity.id}`}
                  className="hover:bg-muted/50 flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <span>{opportunity.name}</span>
                  <Badge variant="outline">
                    {OPPORTUNITY_STAGE_LABELS[opportunity.stage]}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activities" className="pt-4">
          <ActivitiesPanel companyId={company.id} />
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <NotesPanel companyId={company.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  label,
  value,
  isText,
}: {
  label: string;
  value: number | string | null;
  isText?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={isText ? "truncate text-sm" : "text-xl font-semibold"}>
        {value ?? "—"}
      </p>
    </div>
  );
}
