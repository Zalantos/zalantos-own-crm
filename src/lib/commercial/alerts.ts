import { businessDaysBetween } from "@/lib/commercial/business-days";

// Constantes y reglas puras (seguras para componentes cliente). La detección
// es determinística y no usa modelos de IA; los servicios con base de datos
// viven en alert-service.ts.
export const ALERT_PIPELINES = ["prospecting", "opportunity"] as const;
export type AlertPipeline = (typeof ALERT_PIPELINES)[number];

export const ALERT_PIPELINE_LABELS: Record<AlertPipeline, string> = {
  prospecting: "Prospección",
  opportunity: "Oportunidades",
};

export const ALERT_CONDITIONS = [
  "stage_stale",
  "no_interaction",
  "no_next_action",
  "next_action_overdue",
  "reactivation_due",
] as const;

export type AlertCondition = (typeof ALERT_CONDITIONS)[number];

export const ALERT_CONDITION_LABELS: Record<AlertCondition, string> = {
  stage_stale: "Detenido en la etapa",
  no_interaction: "Sin interacción reciente",
  no_next_action: "Sin próxima acción",
  next_action_overdue: "Próxima acción vencida",
  reactivation_due: "Alcanzó la fecha de reactivación",
};

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: "Informativa",
  warning: "Advertencia",
  critical: "Crítica",
};

export const ALERT_DAY_TYPES = ["calendar", "business"] as const;
export type AlertDayType = (typeof ALERT_DAY_TYPES)[number];

export const ALERT_DAY_TYPE_LABELS: Record<AlertDayType, string> = {
  calendar: "Corridos",
  business: "Hábiles",
};

export const ALERT_RECIPIENT_TYPES = ["owner", "user"] as const;
export type AlertRecipientType = (typeof ALERT_RECIPIENT_TYPES)[number];

// Etapa virtual de las oportunidades pausadas (las pausadas conservan su etapa
// real, pero las reglas de etapa solo aplican a las abiertas).
export const PAUSED_STAGE_KEY = "paused";

// Las pausadas solo admiten reactivation_due, y reactivation_due solo tiene
// sentido en las pausadas.
export function isValidRuleTarget(stageKey: string, condition: AlertCondition) {
  return (stageKey === PAUSED_STAGE_KEY) === (condition === "reactivation_due");
}

export function isAlertCondition(value: unknown): value is AlertCondition {
  return typeof value === "string" && (ALERT_CONDITIONS as readonly string[]).includes(value);
}

export function isAlertSeverity(value: unknown): value is AlertSeverity {
  return typeof value === "string" && (ALERT_SEVERITIES as readonly string[]).includes(value);
}

export function alertConditionLabel(value: string) {
  return isAlertCondition(value) ? ALERT_CONDITION_LABELS[value] : value;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function compareSeverity(a: string, b: string) {
  return (SEVERITY_RANK[a] ?? 3) - (SEVERITY_RANK[b] ?? 3);
}

export function highestSeverity(severities: string[]): AlertSeverity | null {
  const [top] = [...severities].sort(compareSeverity);
  return isAlertSeverity(top) ? top : null;
}

export type AlertRuleInput = {
  id: string;
  pipeline: string;
  stageKey: string;
  condition: string;
  thresholdDays: number;
  dayType: string;
  severity: string;
};

// Hechos de un registro con fechas reales. stageEnteredAt null = fecha legacy
// desconocida: esas reglas no se evalúan antes que inventar un plazo.
export type AlertFacts = {
  status: string;
  stageKey: string;
  stageLabel: string;
  stageEnteredAt: Date | null;
  lastInteractionAt: Date | null;
  nextStep: string | null;
  nextStepDueDate: Date | null;
  reactivateAt: Date | null;
  createdAt: Date;
};

export type AlertHit = {
  anchorAt: Date;
  elapsedDays: number;
  title: string;
  reason: string;
};

const DAY_MS = 86_400_000;

function formatDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function elapsedDays(
  from: Date,
  to: Date,
  dayType: string,
  holidays: Iterable<Date | string> = [],
) {
  if (dayType === "business") return businessDaysBetween(from, to, holidays);
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function dayUnit(rule: AlertRuleInput, days: number) {
  const unit = days === 1 ? "día" : "días";
  if (rule.dayType !== "business") return `${days} ${unit}`;
  return `${days} ${unit} ${days === 1 ? "hábil" : "hábiles"}`;
}

function latest(...dates: (Date | null)[]) {
  const known = dates.filter((date): date is Date => date !== null);
  if (known.length === 0) return null;
  return known.reduce((max, date) => (date > max ? date : max));
}

export function evaluateAlertRule(
  rule: AlertRuleInput,
  facts: AlertFacts,
  now: Date,
  holidays: Iterable<Date | string> = [],
): AlertHit | null {
  if (rule.stageKey !== facts.stageKey) return null;
  const elapsed = (from: Date) => elapsedDays(from, now, rule.dayType, holidays);

  switch (rule.condition) {
    case "stage_stale": {
      if (!facts.stageEnteredAt) return null;
      const days = elapsed(facts.stageEnteredAt);
      if (days < rule.thresholdDays) return null;
      return {
        anchorAt: facts.stageEnteredAt,
        elapsedDays: days,
        title: `${dayUnit(rule, days)} en ${facts.stageLabel}`,
        reason: `Entró a ${facts.stageLabel} el ${formatDay(facts.stageEnteredAt)}; el umbral es ${dayUnit(rule, rule.thresholdDays)}.`,
      };
    }
    case "no_interaction": {
      const anchor = latest(facts.lastInteractionAt, facts.stageEnteredAt);
      if (!anchor) return null;
      const days = elapsed(anchor);
      if (days < rule.thresholdDays) return null;
      const source =
        facts.lastInteractionAt && facts.lastInteractionAt >= anchor
          ? `Última interacción el ${formatDay(anchor)}`
          : `Sin interacciones desde que entró a ${facts.stageLabel} el ${formatDay(anchor)}`;
      return {
        anchorAt: anchor,
        elapsedDays: days,
        title: `${dayUnit(rule, days)} sin interacción en ${facts.stageLabel}`,
        reason: `${source}; el umbral es ${dayUnit(rule, rule.thresholdDays)}.`,
      };
    }
    case "no_next_action": {
      if (facts.nextStep?.trim()) return null;
      const anchor = facts.stageEnteredAt ?? facts.createdAt;
      const days = elapsed(anchor);
      if (days < rule.thresholdDays) return null;
      return {
        anchorAt: anchor,
        elapsedDays: days,
        title: `${facts.stageLabel} sin próxima acción`,
        reason: `No hay próxima acción definida desde el ${formatDay(anchor)}.`,
      };
    }
    case "next_action_overdue": {
      if (!facts.nextStep?.trim() || !facts.nextStepDueDate) return null;
      if (facts.nextStepDueDate >= now) return null;
      const days = elapsed(facts.nextStepDueDate);
      if (days < rule.thresholdDays) return null;
      return {
        anchorAt: facts.nextStepDueDate,
        elapsedDays: days,
        title: `Próxima acción vencida en ${facts.stageLabel}`,
        reason: `"${facts.nextStep}" venció el ${formatDay(facts.nextStepDueDate)}.`,
      };
    }
    case "reactivation_due": {
      if (facts.status !== "paused" || !facts.reactivateAt) return null;
      if (facts.reactivateAt > now) return null;
      return {
        anchorAt: facts.reactivateAt,
        elapsedDays: Math.max(0, elapsed(facts.reactivateAt)),
        title: "Oportunidad pausada por reactivar",
        reason: `Llegó la fecha de reactivación (${formatDay(facts.reactivateAt)}).`,
      };
    }
    default:
      return null;
  }
}

// Una sola alerta por regla, registro y fecha ancla: si la condición se
// mantiene no se repite, ni siquiera después de resolverla a mano.
export function alertDedupeKey(ruleId: string, entityId: string, anchorAt: Date) {
  return `${ruleId}:${entityId}:${formatDay(anchorAt)}`;
}

export const OPEN_ALERT_STATUSES = ["open", "acknowledged"];

type AdviceChannel = "call" | "email" | "meeting" | "linkedin" | null;

// Qué recomendar a partir de una alerta. Texto fijo: la próxima mejor acción
// funciona sin modelo; la IA solo la complementa bajo demanda.
export function alertAdvice(
  pipeline: string,
  stageKey: string,
  condition: string,
): { title: string; channel: AdviceChannel } {
  if (condition === "reactivation_due") {
    return { title: "Reevaluar la oportunidad pausada", channel: "call" };
  }
  if (condition === "no_next_action") {
    return { title: "Definir la próxima acción", channel: null };
  }
  if (condition === "next_action_overdue") {
    return { title: "Ejecutar o reprogramar la próxima acción vencida", channel: null };
  }
  if (pipeline === "prospecting") {
    if (stageKey === "prospect") return { title: "Hacer el primer contacto", channel: "linkedin" };
    if (stageKey === "contacted") return { title: "Hacer seguimiento: sin respuesta al contacto", channel: "email" };
    return { title: "Agendar discovery para identificar un proyecto concreto", channel: "meeting" };
  }
  if (stageKey === "propuesta_principal") {
    return { title: "Hacer seguimiento de la propuesta con el decisor", channel: "call" };
  }
  if (stageKey === "negociacion") {
    return { title: "Retomar el contacto para destrabar la negociación", channel: "call" };
  }
  return { title: "Revisar el avance de la oportunidad", channel: "email" };
}

// Reglas por defecto de una organización nueva. Las existentes las creó la
// migración 20261105120100_commercial_actors_alerts_backfill.
export const DEFAULT_ALERT_RULES: {
  pipeline: AlertPipeline;
  stageKey: string;
  condition: AlertCondition;
  thresholdDays: number;
  severity: AlertSeverity;
}[] = [
  { pipeline: "prospecting", stageKey: "prospect", condition: "stage_stale", thresholdDays: 7, severity: "warning" },
  { pipeline: "prospecting", stageKey: "contacted", condition: "no_interaction", thresholdDays: 7, severity: "warning" },
  { pipeline: "prospecting", stageKey: "lead", condition: "no_next_action", thresholdDays: 0, severity: "warning" },
  { pipeline: "prospecting", stageKey: "lead", condition: "stage_stale", thresholdDays: 14, severity: "warning" },
  { pipeline: "opportunity", stageKey: "reunion_discovery", condition: "stage_stale", thresholdDays: 14, severity: "warning" },
  { pipeline: "opportunity", stageKey: "calificada", condition: "no_next_action", thresholdDays: 0, severity: "warning" },
  { pipeline: "opportunity", stageKey: "propuesta_principal", condition: "no_interaction", thresholdDays: 5, severity: "warning" },
  { pipeline: "opportunity", stageKey: "negociacion", condition: "no_interaction", thresholdDays: 7, severity: "critical" },
  { pipeline: "opportunity", stageKey: PAUSED_STAGE_KEY, condition: "reactivation_due", thresholdDays: 0, severity: "critical" },
];
