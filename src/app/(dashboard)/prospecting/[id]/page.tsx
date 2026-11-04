import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { getActiveOrgUsers, getActiveTeamMembers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPanel } from "@/components/shared/notes/notes-panel";
import { NextActionCard } from "@/components/shared/commercial/next-action-card";
import { FollowUpPanel } from "@/components/shared/commercial/follow-up-panel";
import { AttributionDetails } from "@/components/shared/commercial/attribution-details";
import { OpportunityStatusBadge } from "@/components/shared/opportunities/status-badge";
import { LeadActions } from "@/components/shared/prospecting/lead-actions";
import { ActorsPanel } from "@/components/shared/commercial/actors-panel";
import { AlertsPanel } from "@/components/shared/commercial/alerts-panel";
import { listRecordActors, loadActorPickerOptions } from "@/lib/commercial/actor-service";
import {
  loadRecordAlerts,
  mergeAlertSuggestions,
  refreshRecordAlerts,
} from "@/lib/commercial/alert-service";
import { attributionSummarySelect } from "@/lib/commercial/attribution";
import { leadStatusLabel } from "@/lib/commercial/leads";
import { leadFollowUpSuggestions, loadFollowUpRecords } from "@/lib/commercial/follow-up";
import { actorLabel, createdViaLabel } from "@/lib/traceability";

function isoDate(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "—";
}

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, org } = await requireOrgContext();
  const lead = await db.commercialLead.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      person: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, roleTitle: true, linkedinUrl: true } },
      owner: { select: { id: true, name: true, email: true } },
      createdBy: { select: { name: true, email: true } },
      firstTouchAttribution: { select: attributionSummarySelect },
      lastTouchAttribution: { select: attributionSummarySelect },
      inboundLead: { select: { id: true, source: true, createdAt: true } },
      legacyOpportunity: { select: { id: true, name: true } },
      opportunities: {
        select: { id: true, name: true, status: true, estimatedValue: true, stage: { select: { label: true } } },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { opportunities: true } },
    },
  });
  if (!lead) notFound();

  await refreshRecordAlerts(db, org.id, { entity: "commercial_lead", id: lead.id });
  const [records, teamMembers, users, companies, history, companyPeople, leadActors, actorOptions, alerts] = await Promise.all([
    loadFollowUpRecords(db, "commercial_lead", lead.id),
    getActiveTeamMembers(db),
    getActiveOrgUsers(db),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.commercialStatusChange.findMany({
      where: { entityType: "commercial_lead", entityId: lead.id },
      orderBy: { changedAt: "desc" },
    }),
    lead.companyId
      ? db.person.findMany({
          where: { companyRelationships: { some: { companyId: lead.companyId, endedAt: null } } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
    listRecordActors(db, { type: "commercial_lead", id: lead.id }),
    loadActorPickerOptions(db),
    loadRecordAlerts(db, { entity: "commercial_lead", id: lead.id }),
  ]);
  const actors = new Map(users.map((user) => [user.id, user.name ?? user.email]));
  const suggestions = mergeAlertSuggestions(leadFollowUpSuggestions(lead, records), alerts);
  const ownerLabel = lead.owner ? actorLabel(lead.owner) : "Sin responsable";
  const closed = lead.status === "converted" || lead.status === "disqualified";
  const people = lead.person
    ? [{ id: lead.person.id, label: `${lead.person.firstName} ${lead.person.lastName}` }]
    : companyPeople.map((person) => ({ id: person.id, label: `${person.firstName} ${person.lastName}` }));

  return (
    <div className="min-w-0">
      <PageHeader
        title={lead.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{leadStatusLabel(lead.status)}</Badge>
            {lead.company && (
              <Link href={`/companies/${lead.company.id}`} className="hover:underline">
                {lead.company.name}
              </Link>
            )}
            {lead.person && (
              <Link href={`/people/${lead.person.id}`} className="hover:underline">
                {lead.person.firstName} {lead.person.lastName}
              </Link>
            )}
          </span>
        }
        actions={
          <LeadActions
            lead={{
              id: lead.id,
              title: lead.title,
              status: lead.status,
              companyId: lead.companyId,
              ownerId: lead.ownerId,
              priority: lead.priority,
              description: lead.description,
              interestSignal: lead.interestSignal,
              defaultOpportunityName: lead.company ? `${lead.company.name} · ` : lead.title,
            }}
            companies={companies.map((company) => ({ id: company.id, label: company.name }))}
            users={users.map((user) => ({ id: user.id, label: user.name ?? user.email }))}
          />
        }
      />

      <AlertsPanel alerts={alerts} />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextActionCard
            entity="commercial_lead"
            entityId={lead.id}
            value={{
              nextStep: lead.nextStep,
              nextStepDueDate: lead.nextStepDueDate?.toISOString() ?? null,
              nextStepChannel: lead.nextStepChannel,
              nextStepContext: lead.nextStepContext,
              nextStepActivityId: lead.nextStepActivityId,
            }}
            ownerLabel={ownerLabel}
            suggestions={suggestions}
            openTasks={records.openTasks.map((task) => ({ id: task.id, title: task.title }))}
            closed={closed}
          />
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Ciclo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Identificado: {isoDate(lead.identifiedAt)}</p>
            <p>Primer contacto: {isoDate(lead.firstContactAt)}</p>
            <p>Lead desde: {isoDate(lead.becameLeadAt)}</p>
            <p>Convertido: {isoDate(lead.convertedAt)}</p>
            <p>Última interacción: {isoDate(lead.lastInteractionAt)}</p>
            {lead.disqualifiedAt && (
              <p className="text-muted-foreground">
                Descartado {isoDate(lead.disqualifiedAt)}: {lead.disqualificationReason}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Responsable: {ownerLabel} · creado por {actorLabel(lead.createdBy)} vía {createdViaLabel(lead.createdVia)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground text-xs">Contacto</p>
            {lead.person ? (
              <>
                <p className="font-medium">
                  {lead.person.firstName} {lead.person.lastName}
                  {lead.person.roleTitle ? ` · ${lead.person.roleTitle}` : ""}
                </p>
                <p>{lead.person.email ?? "Sin email"}</p>
                {lead.person.phone && <p>{lead.person.phone}</p>}
                {lead.person.linkedinUrl && (
                  <a href={lead.person.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    LinkedIn
                  </a>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Sin persona vinculada</p>
            )}
            {lead.interestSignal && (
              <p className="pt-2">
                <span className="text-muted-foreground">Interés: </span>
                {lead.interestSignal}
              </p>
            )}
            {lead.description && <p className="text-muted-foreground whitespace-pre-wrap">{lead.description}</p>}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-muted-foreground text-xs">Origen (primer toque)</p>
            <AttributionDetails attribution={lead.firstTouchAttribution} />
            {lead.lastTouchAttribution && lead.lastTouchAttribution.id !== lead.firstTouchAttribution?.id && (
              <>
                <p className="text-muted-foreground pt-2 text-xs">Toque más reciente</p>
                <AttributionDetails attribution={lead.lastTouchAttribution} />
              </>
            )}
            {lead.inboundLead && (
              <p className="text-sm">
                <Link href={`/leads/${lead.inboundLead.id}`} className="text-primary hover:underline">
                  Ver lead entrante original
                </Link>
              </p>
            )}
            {lead.legacyOpportunity && (
              <p className="text-sm">
                Oportunidad legacy:{" "}
                <Link href={`/opportunities/${lead.legacyOpportunity.id}`} className="text-primary hover:underline">
                  {lead.legacyOpportunity.name}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground text-xs">Oportunidades generadas ({lead._count.opportunities})</p>
            {lead.opportunities.length === 0 ? (
              <p className="text-muted-foreground">Ninguna todavía.</p>
            ) : (
              lead.opportunities.map((opportunity) => (
                <Link key={opportunity.id} href={`/opportunities/${opportunity.id}`} className="flex items-center justify-between gap-2 hover:underline">
                  <span className="truncate">{opportunity.name}</span>
                  <OpportunityStatusBadge status={opportunity.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="follow-up">
        <TabsList>
          <TabsTrigger value="follow-up">Seguimiento</TabsTrigger>
          <TabsTrigger value="actors">Actores ({leadActors.length})</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="history">Historial de estados</TabsTrigger>
        </TabsList>
        <TabsContent value="follow-up" className="pt-4">
          <FollowUpPanel
            records={records}
            teamMembers={teamMembers}
            links={{ commercialLeadId: lead.id, companyId: lead.companyId ?? undefined, personId: lead.personId ?? undefined }}
            people={people}
            offerMarkContacted={lead.status === "prospect"}
          />
        </TabsContent>
        <TabsContent value="actors" className="pt-4">
          <ActorsPanel target={{ type: "commercial_lead", id: lead.id }} actors={leadActors} options={actorOptions} />
        </TabsContent>
        <TabsContent value="notes" className="pt-4">
          <NotesPanel commercialLeadId={lead.id} />
        </TabsContent>
        <TabsContent value="history" className="space-y-1 pt-4 text-sm">
          {history.map((change) => (
            <p key={change.id}>
              <span className="font-medium">
                {change.fromValue ? `${leadStatusLabel(change.fromValue)} → ` : ""}
                {leadStatusLabel(change.toValue)}
              </span>{" "}
              <span className="text-muted-foreground">
                {change.changedAt.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                {change.actorId ? (actors.get(change.actorId) ?? "Usuario") : "Sistema"} · {change.source}
                {change.reason ? ` · ${change.reason}` : ""}
              </span>
            </p>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
