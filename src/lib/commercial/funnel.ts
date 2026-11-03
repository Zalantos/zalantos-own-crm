import type { TenantClient } from "@/lib/tenant";
import { ACTIVITY_OPEN_STATUSES } from "@/lib/activity-status";
import { STAGE_KEYS } from "@/lib/pipeline/stages";

// Analítica comercial (funnel), separada del tablero operativo. Fórmulas en
// docs/context/commercial-process.md#métricas:
// - Volumen del período: eventos cuya fecha real cae en [from, to].
// - Conversión por cohorte: de los registros CREADOS en el período, qué
//   fracción alcanzó la etapa X (a la fecha de consulta). Nunca stock/stock.
// - Tiempos: mediana y promedio en días solo con ambas fechas conocidas; se
//   informa el tamaño de muestra (n). Fechas legacy desconocidas se excluyen.

export type Period = { from: Date; to: Date };

export type LeadRow = {
  id: string;
  status: string;
  ownerId: string | null;
  identifiedAt: Date;
  firstContactAt: Date | null;
  becameLeadAt: Date | null;
  convertedAt: Date | null;
  sourceChannel: string | null;
  campaignId: string | null;
  referrerPartnerId: string | null;
};

export type OpportunityRow = {
  id: string;
  status: string;
  ownerId: string | null;
  createdAt: Date;
  estimatedValue: number | null;
  recurringValue: number | null;
  probability: number | null;
  nextStep: string | null;
  nextStepDueDate: Date | null;
  qualifiedAt: Date | null;
  proposalSentAt: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  sprint0ScheduledAt: Date | null;
  sprint0CompletedAt: Date | null;
  diagnosisDeliveredAt: Date | null;
  sourceChannel: string | null;
  campaignId: string | null;
  partnerIds: string[];
};

const DAY_MS = 86_400_000;

function within(date: Date | null, period: Period) {
  return Boolean(date && date >= period.from && date <= period.to);
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export type DurationStat = { n: number; averageDays: number | null; medianDays: number | null };

export function durationStat(pairs: [Date | null, Date | null][]): DurationStat {
  const days = pairs
    .filter((pair): pair is [Date, Date] => Boolean(pair[0] && pair[1] && pair[1] >= pair[0]))
    .map(([start, end]) => (end.getTime() - start.getTime()) / DAY_MS)
    .sort((a, b) => a - b);
  if (days.length === 0) return { n: 0, averageDays: null, medianDays: null };
  const middle = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[middle] : (days[middle - 1] + days[middle]) / 2;
  return {
    n: days.length,
    averageDays: days.reduce((sum, value) => sum + value, 0) / days.length,
    medianDays: median,
  };
}

export type BreakdownRow = {
  key: string;
  leads: number;
  opportunities: number;
  won: number;
  wonValue: number;
  lost: number;
};

function breakdown(
  leads: LeadRow[],
  opportunities: OpportunityRow[],
  period: Period,
  keysOfLead: (lead: LeadRow) => string[],
  keysOfOpportunity: (opportunity: OpportunityRow) => string[],
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  const row = (key: string) => {
    const existing = rows.get(key);
    if (existing) return existing;
    const created = { key, leads: 0, opportunities: 0, won: 0, wonValue: 0, lost: 0 };
    rows.set(key, created);
    return created;
  };
  for (const lead of leads) {
    if (!within(lead.identifiedAt, period)) continue;
    for (const key of keysOfLead(lead)) row(key).leads += 1;
  }
  for (const opportunity of opportunities) {
    const keys = keysOfOpportunity(opportunity);
    for (const key of keys) {
      if (within(opportunity.createdAt, period)) row(key).opportunities += 1;
      if (opportunity.status === "won" && within(opportunity.wonAt, period)) {
        row(key).won += 1;
        row(key).wonValue += opportunity.estimatedValue ?? 0;
      }
      if (opportunity.status === "lost" && within(opportunity.lostAt, period)) row(key).lost += 1;
    }
  }
  return [...rows.values()]
    .filter((entry) => entry.leads + entry.opportunities + entry.won + entry.lost > 0)
    .sort((a, b) => b.won - a.won || b.opportunities - a.opportunities || b.leads - a.leads);
}

export function computeFunnel(
  leads: LeadRow[],
  opportunities: OpportunityRow[],
  period: Period,
  extras: { overdueCommercialTasks: number },
  now: Date = new Date(),
) {
  const leadCohort = leads.filter((lead) => within(lead.identifiedAt, period));
  const opportunityCohort = opportunities.filter((opportunity) => within(opportunity.createdAt, period));
  const open = opportunities.filter((opportunity) => opportunity.status === "open");

  const volume = {
    prospectsCreated: leadCohort.length,
    contacted: leads.filter((lead) => within(lead.firstContactAt, period)).length,
    leadsGenerated: leads.filter((lead) => within(lead.becameLeadAt, period)).length,
    leadsConverted: leads.filter((lead) => within(lead.convertedAt, period)).length,
    opportunitiesCreated: opportunityCohort.length,
    qualified: opportunities.filter((opportunity) => within(opportunity.qualifiedAt, period)).length,
    proposalsSent: opportunities.filter((opportunity) => within(opportunity.proposalSentAt, period)).length,
    won: opportunities.filter((opportunity) => opportunity.status === "won" && within(opportunity.wonAt, period)).length,
    lost: opportunities.filter((opportunity) => opportunity.status === "lost" && within(opportunity.lostAt, period)).length,
    wonValue: opportunities
      .filter((opportunity) => opportunity.status === "won" && within(opportunity.wonAt, period))
      .reduce((sum, opportunity) => sum + (opportunity.estimatedValue ?? 0), 0),
  };

  const cohort = {
    leads: {
      size: leadCohort.length,
      contactedRate: rate(leadCohort.filter((lead) => lead.firstContactAt).length, leadCohort.length),
      leadRate: rate(leadCohort.filter((lead) => lead.becameLeadAt).length, leadCohort.length),
      convertedRate: rate(leadCohort.filter((lead) => lead.convertedAt).length, leadCohort.length),
    },
    opportunities: {
      size: opportunityCohort.length,
      qualifiedRate: rate(opportunityCohort.filter((o) => o.qualifiedAt).length, opportunityCohort.length),
      proposalRate: rate(opportunityCohort.filter((o) => o.proposalSentAt).length, opportunityCohort.length),
      wonRate: rate(opportunityCohort.filter((o) => o.status === "won").length, opportunityCohort.length),
      lostRate: rate(opportunityCohort.filter((o) => o.status === "lost").length, opportunityCohort.length),
      // Win rate sobre las cerradas de la cohorte (excluye abiertas).
      winRateClosed: rate(
        opportunityCohort.filter((o) => o.status === "won").length,
        opportunityCohort.filter((o) => o.status === "won" || o.status === "lost").length,
      ),
    },
  };

  const durations = {
    prospectToContact: durationStat(leadCohort.map((l) => [l.identifiedAt, l.firstContactAt])),
    contactToLead: durationStat(leadCohort.map((l) => [l.firstContactAt, l.becameLeadAt])),
    leadToOpportunity: durationStat(leadCohort.map((l) => [l.becameLeadAt, l.convertedAt])),
    opportunityToProposal: durationStat(opportunityCohort.map((o) => [o.createdAt, o.proposalSentAt])),
    proposalToWon: durationStat(
      opportunityCohort.filter((o) => o.status === "won").map((o) => [o.proposalSentAt, o.wonAt]),
    ),
    opportunityToWon: durationStat(
      opportunityCohort.filter((o) => o.status === "won").map((o) => [o.createdAt, o.wonAt]),
    ),
  };

  const withProbability = open.filter((o) => o.probability != null);
  const pipeline = {
    openCount: open.length,
    openValue: open.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0),
    openRecurringMonthly: open.reduce((sum, o) => sum + (o.recurringValue ?? 0), 0),
    // Año 1 = implementación + 12 × recurrente mensual (estimación, no facturación).
    openYearOneValue: open.reduce(
      (sum, o) => sum + (o.estimatedValue ?? 0) + 12 * (o.recurringValue ?? 0),
      0,
    ),
    weightedValue: withProbability.reduce(
      (sum, o) => sum + ((o.estimatedValue ?? 0) * (o.probability ?? 0)) / 100,
      0,
    ),
    withoutProbability: open.length - withProbability.length,
    withoutNextAction: open.filter((o) => !o.nextStep?.trim() || !o.nextStepDueDate).length,
    nextActionOverdue: open.filter((o) => o.nextStepDueDate && o.nextStepDueDate < now).length,
    overdueCommercialTasks: extras.overdueCommercialTasks,
  };

  const sprint0Cohort = opportunities.filter((o) => within(o.sprint0CompletedAt, period));
  const sprint0 = {
    scheduled: opportunities.filter((o) => within(o.sprint0ScheduledAt, period)).length,
    completed: sprint0Cohort.length,
    diagnosisDelivered: opportunities.filter((o) => within(o.diagnosisDeliveredAt, period)).length,
    // Cohorte: Sprint 0 realizados en el período que luego enviaron propuesta.
    toProposalRate: rate(
      sprint0Cohort.filter((o) => o.proposalSentAt && o.sprint0CompletedAt && o.proposalSentAt >= o.sprint0CompletedAt).length,
      sprint0Cohort.length,
    ),
  };

  const byOwner = breakdown(
    leads,
    opportunities,
    period,
    (lead) => [lead.ownerId ?? "none"],
    (opportunity) => [opportunity.ownerId ?? "none"],
  );
  const bySource = breakdown(
    leads,
    opportunities,
    period,
    (lead) => [lead.sourceChannel ?? "unknown"],
    (opportunity) => [opportunity.sourceChannel ?? "unknown"],
  );
  const byCampaign = breakdown(
    leads,
    opportunities,
    period,
    (lead) => (lead.campaignId ? [lead.campaignId] : []),
    (opportunity) => (opportunity.campaignId ? [opportunity.campaignId] : []),
  );
  const byPartner = breakdown(
    leads,
    opportunities,
    period,
    (lead) => (lead.referrerPartnerId ? [lead.referrerPartnerId] : []),
    (opportunity) => opportunity.partnerIds,
  );

  return { period, volume, cohort, durations, pipeline, sprint0, byOwner, bySource, byCampaign, byPartner };
}

export type FunnelReport = ReturnType<typeof computeFunnel>;

// Carga los datos de la org (excluye oportunidades archivadas). La fecha de
// "calificada" sale del historial de etapas (primera entrada registrada).
export async function loadFunnel(db: TenantClient, period: Period): Promise<FunnelReport> {
  const now = new Date();
  const [leads, opportunities, qualifiedEntries, overdueCommercialTasks] = await Promise.all([
    db.commercialLead.findMany({
      select: {
        id: true,
        status: true,
        ownerId: true,
        identifiedAt: true,
        firstContactAt: true,
        becameLeadAt: true,
        convertedAt: true,
        firstTouchAttribution: {
          select: { sourceChannel: true, campaignId: true, referrerPartnerId: true },
        },
      },
    }),
    db.opportunity.findMany({
      where: { status: { not: "archived" } },
      select: {
        id: true,
        status: true,
        ownerId: true,
        createdAt: true,
        estimatedValue: true,
        recurringValue: true,
        probability: true,
        nextStep: true,
        nextStepDueDate: true,
        proposalSentAt: true,
        wonAt: true,
        lostAt: true,
        sprint0ScheduledAt: true,
        sprint0CompletedAt: true,
        diagnosisDeliveredAt: true,
        firstTouchAttribution: {
          select: { sourceChannel: true, campaignId: true, referrerPartnerId: true },
        },
        commercialPartners: { select: { commercialPartnerId: true } },
      },
    }),
    db.opportunityStageHistory.groupBy({
      by: ["opportunityId"],
      where: { stageKey: STAGE_KEYS.qualified, enteredAt: { not: null } },
      _min: { enteredAt: true },
    }),
    db.activity.count({
      where: {
        occurredAt: null,
        status: { in: ACTIVITY_OPEN_STATUSES },
        dueDate: { lt: now },
        OR: [
          { opportunityId: { not: null } },
          { commercialLeadId: { not: null } },
          { commercialPartnerId: { not: null } },
        ],
      },
    }),
  ]);
  const qualifiedAt = new Map(qualifiedEntries.map((entry) => [entry.opportunityId, entry._min.enteredAt]));

  return computeFunnel(
    leads.map((lead) => ({
      id: lead.id,
      status: lead.status,
      ownerId: lead.ownerId,
      identifiedAt: lead.identifiedAt,
      firstContactAt: lead.firstContactAt,
      becameLeadAt: lead.becameLeadAt,
      convertedAt: lead.convertedAt,
      sourceChannel: lead.firstTouchAttribution?.sourceChannel ?? null,
      campaignId: lead.firstTouchAttribution?.campaignId ?? null,
      referrerPartnerId: lead.firstTouchAttribution?.referrerPartnerId ?? null,
    })),
    opportunities.map((opportunity) => {
      const partnerIds = new Set(opportunity.commercialPartners.map((p) => p.commercialPartnerId));
      if (opportunity.firstTouchAttribution?.referrerPartnerId) {
        partnerIds.add(opportunity.firstTouchAttribution.referrerPartnerId);
      }
      return {
        id: opportunity.id,
        status: opportunity.status,
        ownerId: opportunity.ownerId,
        createdAt: opportunity.createdAt,
        estimatedValue: opportunity.estimatedValue?.toNumber() ?? null,
        recurringValue: opportunity.recurringValue?.toNumber() ?? null,
        probability: opportunity.probability,
        nextStep: opportunity.nextStep,
        nextStepDueDate: opportunity.nextStepDueDate,
        qualifiedAt: qualifiedAt.get(opportunity.id) ?? null,
        proposalSentAt: opportunity.proposalSentAt,
        wonAt: opportunity.wonAt,
        lostAt: opportunity.lostAt,
        sprint0ScheduledAt: opportunity.sprint0ScheduledAt,
        sprint0CompletedAt: opportunity.sprint0CompletedAt,
        diagnosisDeliveredAt: opportunity.diagnosisDeliveredAt,
        sourceChannel: opportunity.firstTouchAttribution?.sourceChannel ?? null,
        campaignId: opportunity.firstTouchAttribution?.campaignId ?? null,
        partnerIds: [...partnerIds],
      };
    }),
    period,
    { overdueCommercialTasks },
    now,
  );
}
