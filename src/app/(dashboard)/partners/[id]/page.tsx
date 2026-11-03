import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { getActiveOrgUsers, getActiveTeamMembers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPanel } from "@/components/shared/notes/notes-panel";
import { NextActionCard } from "@/components/shared/commercial/next-action-card";
import { FollowUpPanel } from "@/components/shared/commercial/follow-up-panel";
import { OpportunityStatusBadge } from "@/components/shared/opportunities/status-badge";
import {
  AddPartnerContactForm,
  AllianceFieldsForm,
  AllianceStageControls,
} from "@/components/shared/partners/partner-forms";
import { loadFollowUpRecords, partnerSuggestions } from "@/lib/commercial/follow-up";
import {
  ALLIANCE_STATUS_LABELS,
  allianceStageLabel,
  isAllianceStatus,
} from "@/lib/commercial/partners";
import { leadStatusLabel } from "@/lib/commercial/leads";
import { formatCurrencyValue } from "@/lib/format";
import { actorLabel } from "@/lib/traceability";

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, db } = await requireOrgContext();
  const partner = await db.commercialPartner.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      linkedCompany: { select: { id: true, name: true } },
      linkedPerson: { select: { id: true, firstName: true, lastName: true } },
      contacts: {
        include: { person: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      companyAssignments: { include: { company: { select: { id: true, name: true } } } },
    },
  });
  if (!partner) notFound();

  const [records, teamMembers, users, people, referredLeads, opportunities, history] = await Promise.all([
    loadFollowUpRecords(db, "commercial_partner", partner.id),
    getActiveTeamMembers(db),
    getActiveOrgUsers(db),
    db.person.findMany({ orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    db.commercialLead.findMany({
      where: { firstTouchAttribution: { referrerPartnerId: partner.id } },
      select: { id: true, title: true, status: true, identifiedAt: true },
      orderBy: { identifiedAt: "desc" },
    }),
    // Oportunidades donde participa (snapshot económico en ofertas) o que refirió.
    db.opportunity.findMany({
      where: {
        OR: [
          { commercialPartners: { some: { commercialPartnerId: partner.id } } },
          { firstTouchAttribution: { referrerPartnerId: partner.id } },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
        estimatedValue: true,
        wonAt: true,
        company: { select: { name: true } },
        commercialPartners: {
          where: { commercialPartnerId: partner.id },
          select: { role: true, profitSharePercentage: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.commercialStatusChange.findMany({
      where: { entityType: "commercial_partner", entityId: partner.id },
      orderBy: { changedAt: "desc" },
    }),
  ]);
  const actors = new Map(users.map((user) => [user.id, user.name ?? user.email]));
  const won = opportunities.filter((opportunity) => opportunity.status === "won");
  const wonValue = won.reduce((sum, opportunity) => sum + (opportunity.estimatedValue?.toNumber() ?? 0), 0);
  const ownerLabel = partner.owner ? actorLabel(partner.owner) : "Sin responsable";
  const suggestions = partnerSuggestions(partner);
  const contactPeople = partner.contacts.map((contact) => ({
    id: contact.person.id,
    label: `${contact.person.firstName} ${contact.person.lastName}`,
  }));

  return (
    <div className="min-w-0">
      <PageHeader
        title={partner.displayName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{allianceStageLabel(partner.allianceStage)}</Badge>
            {partner.allianceStatus !== "open" && (
              <Badge variant="destructive">
                {isAllianceStatus(partner.allianceStatus) ? ALLIANCE_STATUS_LABELS[partner.allianceStatus] : partner.allianceStatus}
              </Badge>
            )}
            {partner.linkedCompany && (
              <Link href={`/companies/${partner.linkedCompany.id}`} className="hover:underline">
                {partner.linkedCompany.name}
              </Link>
            )}
            {partner.linkedPerson && (
              <Link href={`/people/${partner.linkedPerson.id}`} className="hover:underline">
                {partner.linkedPerson.firstName} {partner.linkedPerson.lastName}
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <AllianceStageControls partnerId={partner.id} stage={partner.allianceStage} status={partner.allianceStatus} />
            <Button variant="secondary" render={<Link href={`/prospecting/new?referrerPartnerId=${partner.id}`} />}>
              Registrar referido
            </Button>
          </>
        }
      />

      {partner.allianceStatusReason && partner.allianceStatus !== "open" && (
        <p className="text-muted-foreground mb-4 text-sm">Motivo: {partner.allianceStatusReason}</p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextActionCard
            entity="commercial_partner"
            entityId={partner.id}
            value={{
              nextStep: partner.nextStep,
              nextStepDueDate: partner.nextStepDueDate?.toISOString() ?? null,
              nextStepChannel: partner.nextStepChannel,
              nextStepContext: partner.nextStepContext,
              nextStepActivityId: partner.nextStepActivityId,
            }}
            ownerLabel={ownerLabel}
            suggestions={suggestions}
            openTasks={records.openTasks.map((task) => ({ id: task.id, title: task.title }))}
            closed={partner.allianceStatus === "discarded"}
          />
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Resultados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Prospectos referidos: {referredLeads.length}</p>
            <p>Leads generados: {referredLeads.filter((lead) => ["lead", "converted"].includes(lead.status)).length}</p>
            <p>Oportunidades asociadas: {opportunities.length}</p>
            <p>
              Negocios ganados: {won.length} · {formatCurrencyValue(wonValue, org.currency, org.locale)}
            </p>
            <p className="text-muted-foreground text-xs">Reparto económico por negocio: ver ofertas de cada oportunidad.</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="follow-up">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="follow-up">Seguimiento</TabsTrigger>
            <TabsTrigger value="alliance">Alianza</TabsTrigger>
            <TabsTrigger value="referrals">Referidos y negocios</TabsTrigger>
            <TabsTrigger value="contacts">Contactos ({partner.contacts.length})</TabsTrigger>
            <TabsTrigger value="notes">Notas</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="follow-up" className="pt-4">
          <FollowUpPanel
            records={records}
            teamMembers={teamMembers}
            links={{ commercialPartnerId: partner.id, companyId: partner.linkedCompanyId ?? undefined }}
            people={contactPeople}
          />
        </TabsContent>
        <TabsContent value="alliance" className="pt-4">
          <Card size="sm">
            <CardContent>
              <AllianceFieldsForm
                partnerId={partner.id}
                values={{
                  allianceType: partner.allianceType,
                  ownerId: partner.ownerId,
                  commercialPotential: partner.commercialPotential,
                  potentialValue: partner.potentialValue?.toString() ?? null,
                  agreementTerms: partner.agreementTerms,
                  agreementSignedAt: partner.agreementSignedAt?.toISOString().slice(0, 10) ?? null,
                }}
                users={users.map((user) => ({ id: user.id, label: user.name ?? user.email }))}
              />
            </CardContent>
          </Card>
          {partner.companyAssignments.length > 0 && (
            <p className="text-muted-foreground mt-3 text-xs">
              Acuerdos por empresa:{" "}
              {partner.companyAssignments
                .map((assignment) => `${assignment.company.name} (${assignment.defaultProfitSharePercentage?.toString() ?? "—"}%)`)
                .join(", ")}
            </p>
          )}
        </TabsContent>
        <TabsContent value="referrals" className="grid gap-4 pt-4 md:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Prospectos y leads referidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {referredLeads.length === 0 ? (
                <p className="text-muted-foreground">Sin referidos registrados.</p>
              ) : (
                referredLeads.map((lead) => (
                  <Link key={lead.id} href={`/prospecting/${lead.id}`} className="flex justify-between gap-2 hover:underline">
                    <span className="truncate">{lead.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{leadStatusLabel(lead.status)}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Oportunidades asociadas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {opportunities.length === 0 ? (
                <p className="text-muted-foreground">Sin oportunidades.</p>
              ) : (
                opportunities.map((opportunity) => (
                  <Link key={opportunity.id} href={`/opportunities/${opportunity.id}`} className="flex items-center justify-between gap-2 hover:underline">
                    <span className="truncate">
                      {opportunity.name} · {opportunity.company.name}
                      {opportunity.commercialPartners[0]?.profitSharePercentage
                        ? ` · ${opportunity.commercialPartners[0].profitSharePercentage.toString()}%`
                        : ""}
                    </span>
                    <OpportunityStatusBadge status={opportunity.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="contacts" className="space-y-3 pt-4">
          <AddPartnerContactForm
            partnerId={partner.id}
            people={people.map((person) => ({ id: person.id, label: `${person.firstName} ${person.lastName}` }))}
          />
          {partner.contacts.map((contact) => (
            <p key={contact.id} className="text-sm">
              <Link href={`/people/${contact.person.id}`} className="font-medium hover:underline">
                {contact.person.firstName} {contact.person.lastName}
              </Link>
              <span className="text-muted-foreground">
                {contact.role ? ` · ${contact.role}` : ""}
                {contact.person.email ? ` · ${contact.person.email}` : ""}
              </span>
            </p>
          ))}
        </TabsContent>
        <TabsContent value="notes" className="pt-4">
          <NotesPanel commercialPartnerId={partner.id} />
        </TabsContent>
        <TabsContent value="history" className="space-y-1 pt-4 text-sm">
          {history.length === 0 && <p className="text-muted-foreground">Sin cambios registrados.</p>}
          {history.map((change) => (
            <p key={change.id}>
              <span className="font-medium">
                {change.field === "alliance_stage"
                  ? `${allianceStageLabel(change.fromValue)} → ${allianceStageLabel(change.toValue)}`
                  : `Estado: ${change.fromValue ?? "—"} → ${change.toValue}`}
              </span>{" "}
              <span className="text-muted-foreground">
                {change.changedAt.toISOString().slice(0, 10)} ·{" "}
                {change.actorId ? (actors.get(change.actorId) ?? "Usuario") : "Sistema"}
                {change.reason ? ` · ${change.reason}` : ""}
              </span>
            </p>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
