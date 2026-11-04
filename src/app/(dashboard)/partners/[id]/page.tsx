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
import { ActorParticipationCards } from "@/components/shared/commercial/actor-participation-card";
import {
  AddPartnerContactForm,
  PartnerFieldsForm,
} from "@/components/shared/partners/partner-forms";
import { setPartnerActive } from "@/app/(dashboard)/partners/actions";
import { loadActorParticipation } from "@/lib/commercial/actor-service";
import { loadFollowUpRecords, partnerSuggestions } from "@/lib/commercial/follow-up";
import { legacyAllianceLabel, partnerTypeLabel } from "@/lib/commercial/partners";
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

  const actor = { type: "partner" as const, id: partner.id };
  const [records, teamMembers, users, people, participation, history] = await Promise.all([
    loadFollowUpRecords(db, "commercial_partner", partner.id),
    getActiveTeamMembers(db),
    getActiveOrgUsers(db),
    db.person.findMany({ orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    loadActorParticipation(db, actor),
    db.commercialStatusChange.findMany({
      where: { entityType: "commercial_partner", entityId: partner.id },
      orderBy: { changedAt: "desc" },
    }),
  ]);
  const actorNames = new Map(users.map((user) => [user.id, user.name ?? user.email]));
  const { leads, opportunities } = participation;
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
            <Badge variant="outline">{partnerTypeLabel(partner.allianceType)}</Badge>
            {!partner.isActive && <Badge variant="destructive">Inactivo</Badge>}
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
            <form action={setPartnerActive.bind(null, partner.id, !partner.isActive)}>
              <Button type="submit" variant="ghost">
                {partner.isActive ? "Marcar inactivo" : "Reactivar"}
              </Button>
            </form>
            <Button variant="secondary" render={<Link href={`/prospecting/new?referrerPartnerId=${partner.id}`} />}>
              Registrar referido
            </Button>
          </>
        }
      />

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
            closed={!partner.isActive}
          />
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Resultados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Prospectos vinculados: {leads.length}</p>
            <p>Leads generados: {leads.filter((lead) => ["lead", "converted"].includes(lead.status)).length}</p>
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
            <TabsTrigger value="agreement">Acuerdo</TabsTrigger>
            <TabsTrigger value="business">Prospectos y oportunidades</TabsTrigger>
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
        <TabsContent value="agreement" className="pt-4">
          <Card size="sm">
            <CardContent>
              <PartnerFieldsForm
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
        <TabsContent value="business" className="pt-4">
          <ActorParticipationCards actor={actor} participation={participation} />
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
          {history.length > 0 && (
            <p className="text-muted-foreground text-xs">Historial del pipeline de alianzas retirado.</p>
          )}
          {history.map((change) => (
            <p key={change.id}>
              <span className="font-medium">
                {legacyAllianceLabel(change.fromValue)} → {legacyAllianceLabel(change.toValue)}
              </span>{" "}
              <span className="text-muted-foreground">
                {change.changedAt.toISOString().slice(0, 10)} ·{" "}
                {change.actorId ? (actorNames.get(change.actorId) ?? "Usuario") : "Sistema"}
                {change.reason ? ` · ${change.reason}` : ""}
              </span>
            </p>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
