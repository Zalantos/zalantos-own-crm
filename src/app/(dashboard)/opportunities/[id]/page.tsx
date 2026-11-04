import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import { boardStages, getOrgStages, OPERATIONAL_STAGE_KEYS } from "@/lib/pipeline/stages";
import { getActiveOrgUsers, getActiveTeamMembers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPanel } from "@/components/shared/notes/notes-panel";
import { CustomFieldsDetailSection } from "@/components/shared/custom-fields/custom-fields-detail-section";
import {
  EntityContextPanel,
  loadEntityContextData,
} from "@/components/shared/entity-context/entity-context-panel";
import { StageSelect } from "@/components/shared/kanban/stage-select";
import { CompanyTimeline } from "@/components/shared/timeline/company-timeline";
import { LinkifiedText } from "@/components/shared/linkified-text";
import { OpportunityStatusBadge } from "@/components/shared/opportunities/status-badge";
import {
  OpportunityStatusActions,
  ProposalActions,
  RumboHandoffButton,
} from "@/components/shared/opportunities/opportunity-lifecycle";
import { NextActionCard } from "@/components/shared/commercial/next-action-card";
import { FollowUpPanel } from "@/components/shared/commercial/follow-up-panel";
import { ActorsPanel } from "@/components/shared/commercial/actors-panel";
import { AlertsPanel } from "@/components/shared/commercial/alerts-panel";
import { InteractionLogForm } from "@/components/shared/activities/interaction-log-form";
import { listRecordActors, loadActorPickerOptions } from "@/lib/commercial/actor-service";
import {
  loadRecordAlerts,
  mergeAlertSuggestions,
  refreshRecordAlerts,
} from "@/lib/commercial/alert-service";
import { AttributionDetails } from "@/components/shared/commercial/attribution-details";
import { createFormatters, formatCurrencyValue } from "@/lib/format";
import { actorLabel, createdViaLabel } from "@/lib/traceability";
import { LOSS_REASON_LABELS } from "@/lib/opportunities/loss-reason";
import { checkStageTransition, spicedCompleteness } from "@/lib/opportunities/stage-gates";
import { loadStageGateFacts } from "@/lib/commercial/opportunity-service";
import {
  loadFollowUpRecords,
  opportunityFollowUpSuggestions,
} from "@/lib/commercial/follow-up";
import { attributionSummarySelect } from "@/lib/commercial/attribution";
import { RUMBO_HANDOFF_STATUS_LABELS } from "@/lib/commercial/rumbo";
import { SPRINT0_STATUS_LABELS } from "@/lib/zod/opportunity";
import { OpportunityCommercialPartnersPanel } from "@/components/shared/commercial/opportunity-commercial-partners-panel";
import { cloneCommercialOffer } from "@/app/(dashboard)/commercial/actions";

const REVIEW_LABELS: Record<string, string> = {
  won_stage_with_open_status: "Estaba en etapa Ganado con estado abierto: se marcó ganada. Verifica la evidencia del compromiso.",
  lost_stage_with_open_status: "Estaba en etapa Perdido con estado abierto: se marcó perdida.",
  lost_without_reason: "Perdida sin motivo registrado: indícalo.",
  status_stage_conflict: "Estado y etapa legacy contradictorios: revisa cuál es correcto.",
  paused_previous_stage_unknown: "Venía de Congelado sin evidencia de su etapa previa: al reactivar elige la etapa.",
  paused_missing_reactivation: "Pausada sin fecha ni criterio de reactivación: complétalos.",
  proposal_sent_unverified: "En Propuesta enviada sin evidencia del envío: registra la fecha real o retrocede la etapa.",
  pending_prospecting_backfill: "Estaba en una etapa de prospección: pendiente del backfill controlado (convertir en lead o mantener como oportunidad).",
  retired_stage_unmapped: "Su etapa fue retirada y no tiene equivalente: muévela a una etapa activa.",
  open_without_owner: "Oportunidad activa sin responsable: asigna uno.",
  unknown_status: "Estado desconocido: revisa el registro.",
};

function isoDate(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}

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
        stage: { select: { id: true, key: true, label: true, isActive: true } },
        createdBy: { select: { name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        closedBy: { select: { name: true, email: true } },
        commercialLead: { select: { id: true, title: true } },
        firstTouchAttribution: { select: attributionSummarySelect },
        rumboHandoff: true,
        commercialPartners: {
          include: { commercialPartner: true },
          orderBy: { createdAt: "asc" },
        },
        commercialOffers: {
          orderBy: { versionNumber: "desc" },
          include: { profitShares: { orderBy: { createdAt: "asc" } } },
        },
        stageHistory: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    }),
    getOrgStages(db),
  ]);
  if (!opportunity) notFound();

  const columns = boardStages(stages);
  await refreshRecordAlerts(db, org.id, { entity: "opportunity", id: opportunity.id });
  const [partnerCatalog, contextData, records, teamMembers, users, companyPeople, gateFacts, actors, actorOptions, alerts] =
    await Promise.all([
      db.commercialPartner.findMany({
        where: { isActive: true },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true },
      }),
      loadEntityContextData(db, "opportunity", opportunity.id),
      loadFollowUpRecords(db, "opportunity", opportunity.id),
      getActiveTeamMembers(db),
      getActiveOrgUsers(db),
      db.person.findMany({
        where: { companyRelationships: { some: { companyId: opportunity.companyId, endedAt: null } } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { firstName: "asc" },
      }),
      withOrgTransaction(org.id, (tx) => loadStageGateFacts(tx, org.id, opportunity)),
      listRecordActors(db, { type: "opportunity", id: opportunity.id }),
      loadActorPickerOptions(db),
      loadRecordAlerts(db, { entity: "opportunity", id: opportunity.id }),
    ]);
  const suggestions = mergeAlertSuggestions(opportunityFollowUpSuggestions(opportunity, records), alerts);
  const meetings = records.interactions.filter((activity) => activity.type === "meeting");
  const peopleOptions = companyPeople.map((person) => ({ id: person.id, label: `${person.firstName} ${person.lastName}` }));

  const formatters = createFormatters(org);
  const ownerLabel = opportunity.owner ? actorLabel(opportunity.owner) : "Sin responsable";
  const isOpen = opportunity.status === "open";
  const isClosed = ["won", "lost", "archived"].includes(opportunity.status);

  // Requisitos para avanzar a la siguiente etapa operativa.
  const currentRank = (OPERATIONAL_STAGE_KEYS as readonly string[]).indexOf(opportunity.stage.key);
  const nextStageKey = currentRank >= 0 ? OPERATIONAL_STAGE_KEYS[currentRank + 1] : undefined;
  const nextStage = nextStageKey ? columns.find((stage) => stage.key === nextStageKey) : undefined;
  const gate =
    nextStage && isOpen ? checkStageTransition(opportunity.stage.key, nextStage.key, gateFacts) : null;
  const spiced = spicedCompleteness(opportunity);

  const value = opportunity.estimatedValue?.toNumber() ?? null;
  const recurring = opportunity.recurringValue?.toNumber() ?? null;
  const reviewFlags = opportunity.migrationReview?.split(",").filter(Boolean) ?? [];
  const reactivationStages = opportunity.stage.isActive
    ? null
    : columns.map((stage) => ({ id: stage.id, label: stage.label }));

  return (
    <div className="min-w-0">
      <PageHeader
        title={opportunity.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/companies/${opportunity.company.id}`} className="hover:underline">
              {opportunity.company.name}
            </Link>
            <span>·</span>
            <span>{opportunity.stage.label}</span>
            <OpportunityStatusBadge status={opportunity.status} />
          </span>
        }
        actions={
          <>
            {isOpen && (
              <StageSelect opportunityId={opportunity.id} currentStage={opportunity.stage} stages={columns} />
            )}
            <OpportunityStatusActions
              opportunityId={opportunity.id}
              status={opportunity.status}
              reactivationStages={reactivationStages}
            />
            <Button variant="secondary" render={<Link href={`/opportunities/${opportunity.id}/edit`} />}>
              Editar
            </Button>
          </>
        }
      />

      {reviewFlags.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Revisión posterior a la migración del proceso comercial</p>
          <ul className="mt-1 list-disc pl-5">
            {reviewFlags.map((flag) => (
              <li key={flag}>{REVIEW_LABELS[flag] ?? flag}</li>
            ))}
          </ul>
          {opportunity.legacyStageKey && (
            <p className="text-muted-foreground mt-1 text-xs">Etapa original: {opportunity.legacyStageKey}</p>
          )}
        </div>
      )}

      {opportunity.status === "paused" && (
        <Card size="sm" className="mb-4">
          <CardContent className="text-sm">
            <p>
              <span className="font-medium">Pausada</span>
              {opportunity.pausedAt ? ` desde ${isoDate(opportunity.pausedAt)}` : ""} ·{" "}
              {opportunity.pauseReason ?? "sin motivo"}
            </p>
            <p className="text-muted-foreground">
              Reactivación:{" "}
              {opportunity.reactivateAt
                ? isoDate(opportunity.reactivateAt)
                : (opportunity.reactivationCriteria ?? "sin definir")}
            </p>
          </CardContent>
        </Card>
      )}
      {opportunity.status === "won" && (
        <Card size="sm" className="mb-4">
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="font-medium">Ganada</span>
              {opportunity.wonAt ? ` el ${isoDate(opportunity.wonAt)}` : " (fecha legacy desconocida)"}
              {opportunity.closedBy ? ` · ${actorLabel(opportunity.closedBy)}` : ""}
            </p>
            <p className="text-muted-foreground">Evidencia: {opportunity.wonEvidence ?? "no registrada"}</p>
          </CardContent>
        </Card>
      )}
      {opportunity.status === "lost" && (
        <Card size="sm" className="mb-4">
          <CardContent className="text-sm">
            <span className="font-medium">Perdida</span>
            {opportunity.lostAt ? ` el ${isoDate(opportunity.lostAt)}` : ""} ·{" "}
            {opportunity.lossReason ? LOSS_REASON_LABELS[opportunity.lossReason] : "sin motivo"}
            {opportunity.lossDetail ? ` — ${opportunity.lossDetail}` : ""}
          </CardContent>
        </Card>
      )}

      <AlertsPanel alerts={alerts} />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextActionCard
            entity="opportunity"
            entityId={opportunity.id}
            value={{
              nextStep: opportunity.nextStep,
              nextStepDueDate: opportunity.nextStepDueDate?.toISOString() ?? null,
              nextStepChannel: opportunity.nextStepChannel,
              nextStepContext: opportunity.nextStepContext,
              nextStepActivityId: opportunity.nextStepActivityId,
            }}
            ownerLabel={ownerLabel}
            suggestions={suggestions}
            openTasks={records.openTasks.map((task) => ({ id: task.id, title: task.title }))}
            closed={isClosed}
          />
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Avance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {gate ? (
              gate.ok ? (
                <p>
                  Lista para avanzar a <span className="font-medium">{nextStage?.label}</span>.
                </p>
              ) : (
                <div>
                  <p>
                    Para avanzar a <span className="font-medium">{nextStage?.label}</span>:
                  </p>
                  <ul className="text-muted-foreground mt-1 list-disc pl-5 text-xs">
                    {gate.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )
            ) : (
              <p className="text-muted-foreground">
                {isOpen ? "Última etapa operativa: cerrar como ganada o perdida." : "Fuera del pipeline activo."}
              </p>
            )}
            <div>
              <p className="text-muted-foreground text-xs">
                SPICED {spiced.done}/{spiced.total}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {spiced.entries.map((entry) => (
                  <Badge key={entry.key} variant={entry.done ? "success" : "outline"}>
                    {entry.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-muted-foreground space-y-0.5 text-xs">
              {opportunity.sprint0Status && (
                <p>Sprint 0: {SPRINT0_STATUS_LABELS[opportunity.sprint0Status as keyof typeof SPRINT0_STATUS_LABELS] ?? opportunity.sprint0Status}</p>
              )}
              <p>Decisión de proponer: {isoDate(opportunity.proposalDecisionAt) ?? "—"}</p>
              <p>Propuesta enviada: {isoDate(opportunity.proposalSentAt) ?? (gateFacts.hasSentOffer ? "según oferta enviada" : "—")}</p>
              {opportunity.expectedResponseAt && <p>Respuesta esperada: {isoDate(opportunity.expectedResponseAt)}</p>}
            </div>
            {!isClosed && (
              <ProposalActions
                opportunityId={opportunity.id}
                hasDecision={Boolean(opportunity.proposalDecisionAt)}
                sentAt={opportunity.proposalSentAt?.toISOString() ?? null}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground text-xs">Valor</p>
            <p className="font-medium">
              {value != null ? formatCurrencyValue(value, org.currency, org.locale) : "Sin monto"}
              {opportunity.probability != null ? ` · ${opportunity.probability}%` : ""}
            </p>
            {recurring != null && (
              <p className="text-muted-foreground text-xs">
                Recurrente {formatCurrencyValue(recurring, org.currency, org.locale)}/mes · Año 1 estimado{" "}
                {formatCurrencyValue((value ?? 0) + 12 * recurring, org.currency, org.locale)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground text-xs">Personas</p>
            <p>
              Decisor:{" "}
              {opportunity.decisionMaker ? (
                <Link href={`/people/${opportunity.decisionMaker.id}`} className="hover:underline">
                  {opportunity.decisionMaker.firstName} {opportunity.decisionMaker.lastName}
                </Link>
              ) : (
                "—"
              )}
            </p>
            <p>
              Sponsor:{" "}
              {opportunity.sponsor ? (
                <Link href={`/people/${opportunity.sponsor.id}`} className="hover:underline">
                  {opportunity.sponsor.firstName} {opportunity.sponsor.lastName}
                </Link>
              ) : (
                "—"
              )}
            </p>
            <p>Responsable: {ownerLabel}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-muted-foreground text-xs">Origen comercial</p>
            <AttributionDetails attribution={opportunity.firstTouchAttribution} />
            {opportunity.commercialLead && (
              <p className="text-sm">
                Lead:{" "}
                <Link href={`/prospecting/${opportunity.commercialLead.id}`} className="text-primary hover:underline">
                  {opportunity.commercialLead.title}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground text-xs">Trazabilidad</p>
            <p>
              Creada por {actorLabel(opportunity.createdBy)} vía {createdViaLabel(opportunity.createdVia)}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatters.dateTime(opportunity.createdAt)} · actualizada {formatters.dateTime(opportunity.updatedAt)}
            </p>
            {opportunity.stageEnteredAt && (
              <p className="text-muted-foreground text-xs">En la etapa desde {isoDate(opportunity.stageEnteredAt)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {opportunity.status === "won" && (
        <Card size="sm" className="mb-4">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Traspaso a Rumbo</CardTitle>
            {opportunity.rumboHandoff?.status !== "confirmed" && (
              <RumboHandoffButton
                opportunityId={opportunity.id}
                defaultProjectName={opportunity.rumboHandoff?.projectName ?? `${opportunity.company.name} · ${opportunity.name}`}
                users={users}
                defaultResponsibleId={opportunity.rumboHandoff?.responsibleUserId ?? opportunity.ownerId}
                label={opportunity.rumboHandoff ? "Reintentar traspaso" : "Traspasar a Rumbo"}
              />
            )}
          </CardHeader>
          <CardContent className="text-sm">
            {opportunity.rumboHandoff ? (
              <div className="space-y-1">
                <p>
                  Estado:{" "}
                  <Badge variant={opportunity.rumboHandoff.status === "confirmed" ? "success" : opportunity.rumboHandoff.status === "failed" ? "destructive" : "outline"}>
                    {RUMBO_HANDOFF_STATUS_LABELS[opportunity.rumboHandoff.status] ?? opportunity.rumboHandoff.status}
                  </Badge>{" "}
                  · intentos {opportunity.rumboHandoff.attempts}
                </p>
                <p className="text-muted-foreground text-xs">Proyecto: {opportunity.rumboHandoff.projectName}</p>
                {opportunity.rumboHandoff.lastError && (
                  <p className="text-destructive text-xs">{opportunity.rumboHandoff.lastError}</p>
                )}
                {opportunity.rumboHandoff.rumboProjectUrl && (
                  <a href={opportunity.rumboHandoff.rumboProjectUrl} className="text-primary text-xs hover:underline" target="_blank" rel="noreferrer">
                    Ver proyecto en Rumbo
                  </a>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                Aún no se traspasó. La ejecución (tareas técnicas, sprints, PMO) vive en Rumbo.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="follow-up">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="follow-up">Seguimiento</TabsTrigger>
            <TabsTrigger value="actors">Actores ({actors.length})</TabsTrigger>
            <TabsTrigger value="meetings">Reuniones y notas</TabsTrigger>
            <TabsTrigger value="qualification">Calificación</TabsTrigger>
            <TabsTrigger value="offers">Ofertas ({opportunity.commercialOffers.length})</TabsTrigger>
            <TabsTrigger value="partners">Partners ({opportunity.commercialPartners.length})</TabsTrigger>
            <TabsTrigger value="context">Contexto</TabsTrigger>
            <TabsTrigger value="timeline">Historial</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="follow-up" className="pt-4">
          <FollowUpPanel
            records={records}
            teamMembers={teamMembers}
            links={{ opportunityId: opportunity.id, companyId: opportunity.companyId }}
            people={peopleOptions}
          />
        </TabsContent>
        <TabsContent value="actors" className="pt-4">
          <ActorsPanel target={{ type: "opportunity", id: opportunity.id }} actors={actors} options={actorOptions} />
        </TabsContent>
        <TabsContent value="meetings" className="space-y-4 pt-4">
          <Card size="sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Reuniones ({meetings.length})</CardTitle>
              <InteractionLogForm
                companyId={opportunity.companyId}
                opportunityId={opportunity.id}
                people={peopleOptions}
                defaultType="meeting"
                triggerLabel="Registrar reunión"
              />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {meetings.length === 0 ? (
                <p className="text-muted-foreground">Sin reuniones vinculadas.</p>
              ) : (
                meetings.map((meeting) => (
                  <div key={meeting.id} className="space-y-0.5 border-b pb-2 last:border-0 last:pb-0">
                    <p className="flex justify-between gap-2">
                      <span className="truncate font-medium">{meeting.title}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">{isoDate(meeting.occurredAt)}</span>
                    </p>
                    {meeting.description && (
                      <p className="text-muted-foreground text-xs whitespace-pre-wrap">{meeting.description}</p>
                    )}
                    {meeting.outcomes && <p className="text-xs whitespace-pre-wrap">{meeting.outcomes}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <NotesPanel opportunityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="qualification" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Situation", opportunity.situation],
              ["Pain", opportunity.mainPain],
              ["Impact", opportunity.impact],
              ["Critical Event", opportunity.criticalEvent ? `${opportunity.criticalEvent}${opportunity.criticalEventDate ? ` (${isoDate(opportunity.criticalEventDate)})` : ""}` : null],
              ["Decision", opportunity.decisionProcess],
            ].map(([label, text]) => (
              <Card key={label} size="sm">
                <CardContent>
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="text-sm whitespace-pre-wrap">{text ? <LinkifiedText text={text} /> : "—"}</p>
                </CardContent>
              </Card>
            ))}
            <Card size="sm">
              <CardContent className="text-muted-foreground space-y-1 text-xs">
                <p>Sprint 0 agendado: {isoDate(opportunity.sprint0ScheduledAt) ?? "—"}</p>
                <p>Sprint 0 realizado: {isoDate(opportunity.sprint0CompletedAt) ?? "—"}</p>
                <p>Diagnóstico entregado: {isoDate(opportunity.diagnosisDeliveredAt) ?? "—"}</p>
              </CardContent>
            </Card>
          </div>
          <CustomFieldsDetailSection entityType="opportunity" entityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="context" className="pt-4">
          <EntityContextPanel
            entityType="opportunity"
            entityId={opportunity.id}
            profile={contextData.profile}
            sources={contextData.sources}
            proposals={contextData.proposals}
            formatDateTime={formatters.dateTime}
          />
        </TabsContent>
        <TabsContent value="timeline" className="space-y-4 pt-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Historial de etapas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {opportunity.stageHistory.map((period) => (
                <p key={period.id}>
                  <span className="font-medium">{period.stageLabel}</span>{" "}
                  <span className="text-muted-foreground">
                    {period.enteredAt ? isoDate(period.enteredAt) : "fecha desconocida"} →{" "}
                    {period.exitedAt ? isoDate(period.exitedAt) : "actual"} · {period.source}
                  </span>
                </p>
              ))}
            </CardContent>
          </Card>
          <CompanyTimeline opportunityId={opportunity.id} />
        </TabsContent>
        <TabsContent value="partners" className="pt-4">
          <OpportunityCommercialPartnersPanel
            opportunityId={opportunity.id}
            assignments={opportunity.commercialPartners}
            catalog={partnerCatalog.map((partner) => ({ id: partner.id, displayName: partner.displayName }))}
          />
        </TabsContent>
        <TabsContent value="offers" className="space-y-3 pt-4">
          <Button render={<Link href={`/opportunities/${opportunity.id}/offers/new`} />}>Nueva oferta</Button>
          {opportunity.commercialOffers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin ofertas comerciales.</p>
          ) : (
            opportunity.commercialOffers.map((offer) => (
              <div key={offer.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Versión {offer.versionNumber} · {offer.status}
                      {offer.sentAt ? ` · enviada ${isoDate(offer.sentAt)}` : ""}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {offer.productName ?? "Sin producto"} · {offer.pricingUnit}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      render={<Link href={`/opportunities/${opportunity.id}/offers/${offer.id}`} />}
                    >
                      {offer.status === "draft" ? "Editar" : "Ver detalle"}
                    </Button>
                    <form action={cloneCommercialOffer.bind(null, offer.id)}>
                      <Button type="submit" variant="secondary" size="sm">
                        Nueva versión
                      </Button>
                    </form>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Costo:</span> {offer.projectCostAmount?.toString() ?? "—"} {offer.pricingUnit}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Utilidad:</span> {offer.distributableProfitAmount?.toString() ?? "—"} {offer.pricingUnit}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Precio neto:</span> {offer.economicBaseNetAmount?.toString() ?? "—"} {offer.pricingUnit}
                  </div>
                </div>
                {offer.profitShares.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {offer.profitShares.map((share) => (
                      <Badge key={share.id} variant="outline">
                        {share.beneficiaryNameSnapshot}: {share.percentage.toString()}% · {share.amount.toString()} {offer.pricingUnit}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
