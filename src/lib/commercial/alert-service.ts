import { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { ACTIVE_LEAD_STATUSES, leadStatusLabel } from "@/lib/commercial/leads";
import { appendTimelineEvent } from "@/lib/timeline";
import {
  alertAdvice,
  alertDedupeKey,
  compareSeverity,
  DEFAULT_ALERT_RULES,
  evaluateAlertRule,
  OPEN_ALERT_STATUSES,
  PAUSED_STAGE_KEY,
  type AlertFacts,
  type AlertHit,
} from "@/lib/commercial/alerts";
import type { NextActionSuggestion, SuggestionSeverity } from "@/lib/commercial/next-action";
import { evaluateWorkflows } from "@/lib/workflows/engine";

// Detección y ciclo de vida de alertas. Corre en el cron diario y al abrir una
// ficha. Reconcilia el estado con las alertas abiertas: crea lo que falta y
// resuelve lo que dejó de cumplirse. Nunca evalúa ganadas ni perdidas.

type Rule = Prisma.CommercialAlertRuleGetPayload<object>;

type Subject = {
  entity: "opportunity" | "commercial_lead";
  id: string;
  name: string;
  companyId: string | null;
  ownerId: string | null;
  facts: AlertFacts;
};

export type RecordScope = { entity: "opportunity" | "commercial_lead"; id: string };

export type CreatedAlert = {
  id: string;
  title: string;
  reason: string;
  severity: string;
  recipientUserId: string | null;
  entity: "opportunity" | "commercial_lead";
  entityId: string;
  entityName: string;
  companyId: string | null;
};

async function loadOpportunitySubjects(db: TenantClient, scope?: RecordScope): Promise<Subject[]> {
  if (scope && scope.entity !== "opportunity") return [];
  const opportunities = await db.opportunity.findMany({
    where: { status: { in: ["open", "paused"] }, ...(scope ? { id: scope.id } : {}) },
    select: {
      id: true,
      name: true,
      companyId: true,
      ownerId: true,
      status: true,
      stageEnteredAt: true,
      nextStep: true,
      nextStepDueDate: true,
      reactivateAt: true,
      createdAt: true,
      stage: { select: { key: true, label: true } },
    },
  });
  if (opportunities.length === 0) return [];
  const ids = opportunities.map((opportunity) => opportunity.id);
  // El período abierto de OpportunityStageHistory es la fecha real de entrada.
  const [periods, interactions] = await Promise.all([
    db.opportunityStageHistory.findMany({
      where: { opportunityId: { in: ids }, exitedAt: null },
      orderBy: { createdAt: "desc" },
      select: { opportunityId: true, enteredAt: true },
    }),
    db.activity.groupBy({
      by: ["opportunityId"],
      where: { opportunityId: { in: ids }, occurredAt: { not: null, lte: new Date() } },
      _max: { occurredAt: true },
    }),
  ]);
  const enteredAt = new Map<string, Date | null>();
  for (const period of periods) {
    if (!enteredAt.has(period.opportunityId)) enteredAt.set(period.opportunityId, period.enteredAt);
  }
  const lastInteraction = new Map(
    interactions.map((row) => [row.opportunityId, row._max.occurredAt]),
  );
  return opportunities.map((opportunity) => ({
    entity: "opportunity",
    id: opportunity.id,
    name: opportunity.name,
    companyId: opportunity.companyId,
    ownerId: opportunity.ownerId,
    facts: {
      status: opportunity.status,
      stageKey: opportunity.status === "paused" ? PAUSED_STAGE_KEY : opportunity.stage.key,
      stageLabel: opportunity.status === "paused" ? "Pausada" : opportunity.stage.label,
      stageEnteredAt: enteredAt.get(opportunity.id) ?? opportunity.stageEnteredAt,
      lastInteractionAt: lastInteraction.get(opportunity.id) ?? null,
      nextStep: opportunity.nextStep,
      nextStepDueDate: opportunity.nextStepDueDate,
      reactivateAt: opportunity.reactivateAt,
      createdAt: opportunity.createdAt,
    },
  }));
}

async function loadLeadSubjects(db: TenantClient, scope?: RecordScope): Promise<Subject[]> {
  if (scope && scope.entity !== "commercial_lead") return [];
  const leads = await db.commercialLead.findMany({
    where: { status: { in: ACTIVE_LEAD_STATUSES }, ...(scope ? { id: scope.id } : {}) },
    select: {
      id: true,
      title: true,
      companyId: true,
      ownerId: true,
      status: true,
      identifiedAt: true,
      firstContactAt: true,
      becameLeadAt: true,
      statusChangedAt: true,
      lastInteractionAt: true,
      nextStep: true,
      nextStepDueDate: true,
      createdAt: true,
    },
  });
  return leads.map((lead) => {
    // statusChangedAt registra el cambio real, incluidos los retrocesos; las
    // fechas por estado cubren filas migradas sin ese dato.
    const byStatus =
      lead.status === "contacted"
        ? lead.firstContactAt
        : lead.status === "lead"
          ? lead.becameLeadAt
          : lead.identifiedAt;
    return {
      entity: "commercial_lead" as const,
      id: lead.id,
      name: lead.title,
      companyId: lead.companyId,
      ownerId: lead.ownerId,
      facts: {
        status: lead.status,
        stageKey: lead.status,
        stageLabel: leadStatusLabel(lead.status),
        stageEnteredAt: lead.statusChangedAt ?? byStatus,
        lastInteractionAt: lead.lastInteractionAt,
        nextStep: lead.nextStep,
        nextStepDueDate: lead.nextStepDueDate,
        reactivateAt: null,
        createdAt: lead.createdAt,
      },
    };
  });
}

function subjectPipeline(subject: Subject) {
  return subject.entity === "opportunity" ? "opportunity" : "prospecting";
}

function recipientFor(rule: Rule, subject: Subject) {
  return rule.recipientType === "user" && rule.recipientUserId
    ? rule.recipientUserId
    : subject.ownerId;
}

function alertData(
  organizationId: string,
  rule: Rule,
  subject: Subject,
  hit: AlertHit,
  dedupeKey: string,
) {
  return {
    organizationId,
    ruleId: rule.id,
    opportunityId: subject.entity === "opportunity" ? subject.id : null,
    commercialLeadId: subject.entity === "commercial_lead" ? subject.id : null,
    pipeline: rule.pipeline,
    stageKey: rule.stageKey,
    condition: rule.condition,
    severity: rule.severity,
    title: hit.title,
    reason: hit.reason,
    anchorAt: hit.anchorAt,
    dedupeKey,
    recipientUserId: recipientFor(rule, subject),
  };
}

// Reconcilia las alertas de la org, o de un solo registro con `scope`.
export async function syncCommercialAlerts(
  db: TenantClient,
  organizationId: string,
  options: { now?: Date; scope?: RecordScope } = {},
): Promise<{ created: CreatedAlert[]; resolved: number }> {
  const now = options.now ?? new Date();
  const { scope } = options;
  const [rules, holidays, opportunities, leads] = await Promise.all([
    db.commercialAlertRule.findMany({ where: { isActive: true } }),
    db.businessHoliday.findMany({ select: { date: true } }),
    loadOpportunitySubjects(db, scope),
    loadLeadSubjects(db, scope),
  ]);
  const holidayDates = holidays.map((holiday) => holiday.date);
  const subjects = [...opportunities, ...leads];

  const hits = new Map<string, { rule: Rule; subject: Subject; hit: AlertHit }>();
  for (const subject of subjects) {
    for (const rule of rules) {
      if (rule.pipeline !== subjectPipeline(subject)) continue;
      const hit = evaluateAlertRule(rule, subject.facts, now, holidayDates);
      if (!hit) continue;
      hits.set(alertDedupeKey(rule.id, subject.id, hit.anchorAt), { rule, subject, hit });
    }
  }

  const scopeWhere = scope
    ? scope.entity === "opportunity"
      ? { opportunityId: scope.id }
      : { commercialLeadId: scope.id }
    : {};
  const [existing, active] = await Promise.all([
    hits.size > 0
      ? db.commercialAlert.findMany({
          where: { dedupeKey: { in: [...hits.keys()] } },
          select: { dedupeKey: true },
        })
      : Promise.resolve([]),
    db.commercialAlert.findMany({
      where: { status: { in: OPEN_ALERT_STATUSES }, ...scopeWhere },
      select: { id: true, dedupeKey: true },
    }),
  ]);

  const known = new Set(existing.map((alert) => alert.dedupeKey));
  const created: CreatedAlert[] = [];
  for (const [dedupeKey, { rule, subject, hit }] of hits) {
    if (known.has(dedupeKey)) continue;
    try {
      const alert = await db.commercialAlert.create({
        data: alertData(organizationId, rule, subject, hit, dedupeKey),
        select: { id: true, recipientUserId: true },
      });
      created.push({
        id: alert.id,
        title: hit.title,
        reason: hit.reason,
        severity: rule.severity,
        recipientUserId: alert.recipientUserId,
        entity: subject.entity,
        entityId: subject.id,
        entityName: subject.name,
        companyId: subject.companyId,
      });
    } catch (error) {
      // Otra sincronización concurrente la creó primero.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }

  const stale = active.filter((alert) => !hits.has(alert.dedupeKey)).map((alert) => alert.id);
  if (stale.length > 0) {
    await db.commercialAlert.updateMany({
      where: { id: { in: stale } },
      data: { status: "resolved", resolvedAt: now, resolution: "auto" },
    });
  }
  return { created, resolved: stale.length };
}

// Efectos de una alerta nueva: timeline y evento de workflow, una sola vez.
export async function announceAlerts(
  db: TenantClient,
  organizationId: string,
  alerts: CreatedAlert[],
) {
  for (const alert of alerts) {
    await appendTimelineEvent(db, {
      organizationId,
      companyId: alert.companyId,
      opportunityId: alert.entity === "opportunity" ? alert.entityId : null,
      type: "alert_raised",
      title: `Alerta: ${alert.title}`,
      summary: alert.reason,
      refType: alert.entity,
      refId: alert.entityId,
    });
    if (alert.entity === "opportunity") {
      await evaluateWorkflows(db, organizationId, {
        entityType: "opportunity",
        entityId: alert.entityId,
        eventName: "alert_raised",
        after: { alertSeverity: alert.severity, alertTitle: alert.title },
      });
    }
  }
}

// Sincronización de una ficha: la llaman las páginas de detalle y las acciones
// que cambian el estado del registro, para no esperar al cron.
export async function refreshRecordAlerts(
  db: TenantClient,
  organizationId: string,
  scope: RecordScope,
) {
  const { created } = await syncCommercialAlerts(db, organizationId, { scope });
  if (created.length > 0) await announceAlerts(db, organizationId, created);
}

export const alertViewSelect = {
  id: true,
  title: true,
  reason: true,
  severity: true,
  status: true,
  pipeline: true,
  stageKey: true,
  condition: true,
  detectedAt: true,
  acknowledgedAt: true,
  opportunityId: true,
  commercialLeadId: true,
  recipientUserId: true,
  recipientUser: { select: { name: true, email: true } },
} satisfies Prisma.CommercialAlertSelect;

export type AlertView = Prisma.CommercialAlertGetPayload<{ select: typeof alertViewSelect }>;

export async function loadRecordAlerts(db: TenantClient, scope: RecordScope): Promise<AlertView[]> {
  const alerts = await db.commercialAlert.findMany({
    where: {
      status: { in: OPEN_ALERT_STATUSES },
      ...(scope.entity === "opportunity"
        ? { opportunityId: scope.id }
        : { commercialLeadId: scope.id }),
    },
    select: alertViewSelect,
    orderBy: { detectedAt: "desc" },
  });
  return alerts.sort((a, b) => compareSeverity(a.severity, b.severity));
}

// Bloque de pendientes del dashboard: primero lo asignado al usuario.
export async function loadPendingAlerts(db: TenantClient, userId: string, limit = 8) {
  const select = {
    ...alertViewSelect,
    opportunity: { select: { id: true, name: true } },
    commercialLead: { select: { id: true, title: true } },
  } satisfies Prisma.CommercialAlertSelect;
  const [alerts, total] = await Promise.all([
    db.commercialAlert.findMany({
      where: { status: "open" },
      select,
      orderBy: { detectedAt: "desc" },
      take: 100,
    }),
    db.commercialAlert.count({ where: { status: "open" } }),
  ]);
  const sorted = alerts.sort((a, b) => {
    const mine = Number(b.recipientUserId === userId) - Number(a.recipientUserId === userId);
    return mine || compareSeverity(a.severity, b.severity);
  });
  return { alerts: sorted.slice(0, limit), total };
}

const SUPERSEDED_BY_ALERT: Record<string, string[]> = {
  no_interaction: ["proposal_no_response", "contacted_no_response"],
  stage_stale: ["lead_without_opportunity", "prospect_first_contact"],
  no_next_action: ["missing_next_action", "undated_next_action"],
  next_action_overdue: ["next_action_overdue"],
  reactivation_due: ["paused_reactivation_due"],
};

function toSeverity(value: string): SuggestionSeverity {
  return value === "critical" || value === "info" ? value : "warning";
}

// Las alertas lideran la próxima mejor acción y reemplazan a la sugerencia
// equivalente de las reglas fijas, para no recomendar lo mismo dos veces.
export function mergeAlertSuggestions(
  suggestions: NextActionSuggestion[],
  alerts: AlertView[],
  now: Date = new Date(),
): NextActionSuggestion[] {
  const superseded = new Set(alerts.flatMap((alert) => SUPERSEDED_BY_ALERT[alert.condition] ?? []));
  const fromAlerts = alerts.map((alert): NextActionSuggestion => {
    const advice = alertAdvice(alert.pipeline, alert.stageKey, alert.condition);
    return {
      code: `alert:${alert.condition}`,
      title: advice.title,
      channel: advice.channel,
      reason: `${alert.title}. ${alert.reason}`,
      severity: toSeverity(alert.severity),
      suggestedDueDate: new Date(now.toISOString().slice(0, 10)),
    };
  });
  return [...fromAlerts, ...suggestions.filter((item) => !superseded.has(item.code))];
}

// Alta de las reglas por defecto en una organización nueva.
export async function createDefaultAlertRules(
  client: { commercialAlertRule: { createMany: Prisma.CommercialAlertRuleDelegate["createMany"] } },
  organizationId: string,
) {
  await client.commercialAlertRule.createMany({
    data: DEFAULT_ALERT_RULES.map((rule) => ({ ...rule, organizationId })),
    skipDuplicates: true,
  });
}
