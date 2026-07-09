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
import { LinkifiedText, toExternalHref } from "@/components/shared/linkified-text";
import { CompanyStatusBadge } from "@/components/shared/companies/status-badge";
import { OpportunityStageBadge } from "@/components/shared/opportunities/status-badge";
import { createFormatters } from "@/lib/format";
import { actorLabel, createdViaLabel } from "@/lib/traceability";
import { deleteCompany } from "../actions";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, org, db } = await requireOrgContext();

  const company = await db.company.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      people: { orderBy: { createdAt: "desc" } },
      opportunities: {
        orderBy: { createdAt: "desc" },
        include: { stage: { select: { label: true, isWon: true, isLost: true } } },
      },
    },
  });
  if (!company) notFound();
  const canDelete = user.role === "ADMIN" || company.createdById === user.id;
  const formatters = createFormatters(org);
  const contextData = await loadEntityContextData(db, "company", company.id);
  const potentialValue =
    company.potentialValue != null
      ? formatters.currency(company.potentialValue.toString())
      : "—";

  return (
    <div>
      <PageHeader
        title={company.name}
        description={[company.industry, company.country]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <CompanyStatusBadge status={company.status} />
            <Button
              variant="secondary"
              render={<Link href={`/companies/${company.id}/edit`} />}
            >
              Editar
            </Button>
            {canDelete && (
              <form action={deleteCompany.bind(null, company.id)}>
                <Button type="submit" variant="destructive">
                  Eliminar
                </Button>
              </form>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="ICP score" value={company.icpScore} />
        <StatCard label="Fit score" value={company.fitScore} />
        <StatCard label="Pain score" value={company.painScore} />
        <StatCard
          label="Sitio web"
          value={company.website ?? "—"}
          href={
            company.website ? (toExternalHref(company.website) ?? undefined) : undefined
          }
          variant="compact"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Creada por"
          value={actorLabel(company.createdBy)}
          variant="compact"
        />
        <StatCard
          label="Origen de creación"
          value={createdViaLabel(company.createdVia)}
          variant="compact"
        />
        <StatCard
          label="Creada"
          value={formatters.dateTime(company.createdAt)}
          variant="compact"
        />
      </div>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-medium">Estado comercial</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Próximo paso"
            value={company.nextStep ?? "—"}
            variant="compact"
          />
          <StatCard
            label="Fecha del próximo paso"
            value={
              company.nextStepDueDate
                ? formatters.date(company.nextStepDueDate)
                : "—"
            }
            variant="compact"
          />
          <StatCard
            label="Valor potencial"
            value={potentialValue}
            variant="compact"
          />
          <StatCard
            label="Prioridad"
            value={company.priority ?? "—"}
            variant="compact"
          />
          <StatCard
            label="Urgencia"
            value={company.urgency ?? "—"}
            variant="compact"
          />
          <StatCard
            label="Producto de interés"
            value={company.productInterest ?? "—"}
            variant="compact"
          />
          <StatCard
            label="Último contacto"
            value={
              company.lastContactAt
                ? formatters.date(company.lastContactAt)
                : "—"
            }
            variant="compact"
          />
          <StatCard
            label="Timing de compra"
            value={company.buyingTiming ?? "—"}
            variant="compact"
          />
          <StatCard
            label="Origen comercial"
            value={company.source ?? "—"}
            variant="compact"
          />
          <StatCard
            label="Competidor"
            value={company.competitor ?? "—"}
            variant="compact"
          />
          <StatCard
            label="Proveedor actual"
            value={company.currentProvider ?? "—"}
            variant="compact"
          />
        </div>
        {company.mainPain && (
          <div className="rounded-md border p-4">
            <p className="text-muted-foreground mb-1 text-xs">Dolor principal</p>
            <p className="text-sm whitespace-pre-wrap">
              <LinkifiedText text={company.mainPain} />
            </p>
          </div>
        )}
      </section>

      {company.description && (
        <p className="text-muted-foreground mb-6 max-w-3xl text-sm">
          <LinkifiedText text={company.description} />
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
          <TabsTrigger value="context">Contexto</TabsTrigger>
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
                  <OpportunityStageBadge stage={opportunity.stage} />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="context" className="pt-4">
          <EntityContextPanel
            entityType="company"
            entityId={company.id}
            profile={contextData.profile}
            sources={contextData.sources}
            proposals={contextData.proposals}
            formatDateTime={formatters.dateTime}
          />
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
