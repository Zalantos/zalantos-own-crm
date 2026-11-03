// Próxima mejor acción — nivel 1: reglas determinísticas, puras y baratas
// (se evalúan en cada render sin llamar al modelo). El nivel 2 (sugerencia
// IA) es una acción explícita del usuario; ver suggestNextActionWithAI.

export const NEXT_STEP_CHANNELS = [
  "call",
  "email",
  "whatsapp",
  "linkedin",
  "meeting",
  "other",
] as const;

export type NextStepChannel = (typeof NEXT_STEP_CHANNELS)[number];

export const NEXT_STEP_CHANNEL_LABELS: Record<NextStepChannel, string> = {
  call: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  meeting: "Reunión",
  other: "Otro",
};

export function isNextStepChannel(value: unknown): value is NextStepChannel {
  return (
    typeof value === "string" &&
    (NEXT_STEP_CHANNELS as readonly string[]).includes(value)
  );
}

export function nextStepChannelLabel(value: string | null | undefined) {
  if (!value) return null;
  return isNextStepChannel(value) ? NEXT_STEP_CHANNEL_LABELS[value] : value;
}

export type SuggestionSeverity = "critical" | "warning" | "info";

export type NextActionSuggestion = {
  code: string;
  title: string;
  channel: NextStepChannel | null;
  reason: string;
  severity: SuggestionSeverity;
  suggestedDueDate: Date | null;
};

export type NextActionState = "missing" | "overdue" | "scheduled" | "undated";

export function nextActionState(
  nextStep: string | null,
  dueDate: Date | null,
  now: Date = new Date(),
): NextActionState {
  if (!nextStep?.trim()) return "missing";
  if (!dueDate) return "undated";
  return dueDate.getTime() < startOfDay(now).getTime() ? "overdue" : "scheduled";
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function addDays(date: Date, days: number) {
  return new Date(startOfDay(date).getTime() + days * DAY_MS);
}

function formatDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Umbrales documentados en docs/context/commercial-process.md.
export const FOLLOW_UP_THRESHOLDS = {
  proposalNoResponseDays: 5,
  contactedNoResponseDays: 7,
  leadWithoutOpportunityDays: 14,
};

export type OpportunityActionFacts = {
  status: string;
  stageKey: string;
  ownerId: string | null;
  nextStep: string | null;
  nextStepDueDate: Date | null;
  nextStepUpdatedAt: Date | null;
  proposalSentAt: Date | null;
  expectedResponseAt: Date | null;
  reactivateAt: Date | null;
  lastInteractionAt: Date | null;
  lastMeetingAt: Date | null;
  overdueTasks: { title: string; dueDate: Date }[];
};

export function opportunitySuggestions(
  facts: OpportunityActionFacts,
  now: Date = new Date(),
): NextActionSuggestion[] {
  const out: NextActionSuggestion[] = [];
  if (facts.status === "paused") {
    if (facts.reactivateAt && facts.reactivateAt.getTime() <= now.getTime()) {
      out.push({
        code: "paused_reactivation_due",
        title: "Reevaluar la oportunidad pausada: llegó la fecha de reactivación",
        channel: "call",
        reason: `Reactivación prevista para ${formatDay(facts.reactivateAt)}.`,
        severity: "critical",
        suggestedDueDate: startOfDay(now),
      });
    }
    return out;
  }
  if (facts.status !== "open") return out;

  if (!facts.ownerId) {
    out.push({
      code: "missing_owner",
      title: "Asignar un responsable",
      channel: null,
      reason: "Una oportunidad activa debe tener responsable.",
      severity: "critical",
      suggestedDueDate: startOfDay(now),
    });
  }
  const state = nextActionState(facts.nextStep, facts.nextStepDueDate, now);
  if (state === "missing" || state === "undated") {
    out.push({
      code: state === "missing" ? "missing_next_action" : "undated_next_action",
      title: state === "missing" ? "Definir la próxima acción" : "Ponerle fecha a la próxima acción",
      channel: null,
      reason: "Oportunidad activa sin próxima acción fechada (incompleta).",
      severity: "warning",
      suggestedDueDate: addDays(now, 1),
    });
  } else if (state === "overdue" && facts.nextStepDueDate) {
    out.push({
      code: "next_action_overdue",
      title: `Próxima acción vencida: ${facts.nextStep}`,
      channel: null,
      reason: `Vencía el ${formatDay(facts.nextStepDueDate)}.`,
      severity: "critical",
      suggestedDueDate: startOfDay(now),
    });
  }

  if (facts.stageKey === "propuesta_principal" && facts.proposalSentAt) {
    const lastTouch = facts.lastInteractionAt ?? facts.proposalSentAt;
    const silentDays = daysBetween(
      lastTouch > facts.proposalSentAt ? lastTouch : facts.proposalSentAt,
      now,
    );
    const responseDue = facts.expectedResponseAt && facts.expectedResponseAt <= now;
    const noReply =
      !facts.lastInteractionAt || facts.lastInteractionAt <= facts.proposalSentAt;
    if (noReply && (silentDays >= FOLLOW_UP_THRESHOLDS.proposalNoResponseDays || responseDue)) {
      out.push({
        code: "proposal_no_response",
        title: "Llamar al decisor para confirmar recepción de la propuesta",
        channel: "call",
        reason: `Propuesta enviada el ${formatDay(facts.proposalSentAt)}, sin respuesta registrada.`,
        severity: "warning",
        suggestedDueDate: addDays(now, 1),
      });
    }
  }

  if (
    facts.lastMeetingAt &&
    facts.lastMeetingAt <= now &&
    (!facts.nextStepUpdatedAt || facts.nextStepUpdatedAt < facts.lastMeetingAt)
  ) {
    out.push({
      code: "meeting_without_next_step",
      title: "Registrar el próximo paso acordado en la última reunión",
      channel: "email",
      reason: `Reunión del ${formatDay(facts.lastMeetingAt)} sin próximo paso actualizado después.`,
      severity: "warning",
      suggestedDueDate: startOfDay(now),
    });
  }

  for (const task of facts.overdueTasks.slice(0, 3)) {
    out.push({
      code: "task_overdue",
      title: `Tarea comercial vencida: ${task.title}`,
      channel: null,
      reason: `Vencía el ${formatDay(task.dueDate)}.`,
      severity: "warning",
      suggestedDueDate: startOfDay(now),
    });
  }
  return out;
}

export type LeadActionFacts = {
  status: string;
  ownerId: string | null;
  createdVia: string;
  firstContactAt: Date | null;
  becameLeadAt: Date | null;
  lastInteractionAt: Date | null;
  nextStep: string | null;
  nextStepDueDate: Date | null;
  opportunityCount: number;
  overdueTasks: { title: string; dueDate: Date }[];
};

export function leadSuggestions(
  facts: LeadActionFacts,
  now: Date = new Date(),
): NextActionSuggestion[] {
  const out: NextActionSuggestion[] = [];
  if (["converted", "disqualified"].includes(facts.status)) return out;
  if (!facts.ownerId) {
    out.push({
      code: "lead_without_owner",
      title:
        facts.createdVia === "inbound_lead"
          ? "Asignar responsable al lead entrante"
          : "Asignar responsable al prospecto",
      channel: null,
      reason: "Sin responsable nadie hará el seguimiento.",
      severity: "critical",
      suggestedDueDate: startOfDay(now),
    });
  }
  if (facts.status === "prospect" && !facts.nextStep) {
    out.push({
      code: "prospect_first_contact",
      title: "Planificar el primer contacto",
      channel: "linkedin",
      reason: "Prospecto identificado sin intento de contacto registrado.",
      severity: "info",
      suggestedDueDate: addDays(now, 2),
    });
  }
  if (facts.status === "contacted" && facts.firstContactAt) {
    const reply = facts.lastInteractionAt && facts.lastInteractionAt > facts.firstContactAt;
    const days = daysBetween(facts.firstContactAt, now);
    if (!reply && days >= FOLLOW_UP_THRESHOLDS.contactedNoResponseDays) {
      out.push({
        code: "contacted_no_response",
        title: "Hacer seguimiento: contactado sin respuesta",
        channel: "email",
        reason: `Primer contacto el ${formatDay(facts.firstContactAt)}, sin interacción posterior (${days} días).`,
        severity: "warning",
        suggestedDueDate: addDays(now, 1),
      });
    }
  }
  if (
    facts.status === "lead" &&
    facts.opportunityCount === 0 &&
    facts.becameLeadAt &&
    daysBetween(facts.becameLeadAt, now) >= FOLLOW_UP_THRESHOLDS.leadWithoutOpportunityDays
  ) {
    out.push({
      code: "lead_without_opportunity",
      title: "Agendar discovery para identificar un proyecto concreto",
      channel: "meeting",
      reason: `Es lead desde el ${formatDay(facts.becameLeadAt)} y aún no tiene oportunidad.`,
      severity: "warning",
      suggestedDueDate: addDays(now, 2),
    });
  }
  const state = nextActionState(facts.nextStep, facts.nextStepDueDate, now);
  if (state === "overdue" && facts.nextStepDueDate) {
    out.push({
      code: "next_action_overdue",
      title: `Próxima acción vencida: ${facts.nextStep}`,
      channel: null,
      reason: `Vencía el ${formatDay(facts.nextStepDueDate)}.`,
      severity: "critical",
      suggestedDueDate: startOfDay(now),
    });
  }
  for (const task of facts.overdueTasks.slice(0, 3)) {
    out.push({
      code: "task_overdue",
      title: `Tarea vencida: ${task.title}`,
      channel: null,
      reason: `Vencía el ${formatDay(task.dueDate)}.`,
      severity: "warning",
      suggestedDueDate: startOfDay(now),
    });
  }
  return out;
}

export type PartnerActionFacts = {
  allianceStage: string | null;
  allianceStatus: string;
  ownerId: string | null;
  nextStep: string | null;
  nextStepDueDate: Date | null;
};

export function partnerSuggestions(
  facts: PartnerActionFacts,
  now: Date = new Date(),
): NextActionSuggestion[] {
  const out: NextActionSuggestion[] = [];
  if (!facts.allianceStage || facts.allianceStatus !== "open") return out;
  if (!facts.ownerId) {
    out.push({
      code: "partner_without_owner",
      title: "Asignar responsable de la alianza",
      channel: null,
      reason: "La alianza no tiene responsable en Zalantos.",
      severity: "warning",
      suggestedDueDate: startOfDay(now),
    });
  }
  const state = nextActionState(facts.nextStep, facts.nextStepDueDate, now);
  if (state === "missing") {
    out.push({
      code: "missing_next_action",
      title: "Definir la próxima acción de la alianza",
      channel: null,
      reason: "Alianza en desarrollo sin seguimiento definido.",
      severity: "info",
      suggestedDueDate: addDays(now, 3),
    });
  } else if (state === "overdue" && facts.nextStepDueDate) {
    out.push({
      code: "next_action_overdue",
      title: `Próxima acción vencida: ${facts.nextStep}`,
      channel: null,
      reason: `Vencía el ${formatDay(facts.nextStepDueDate)}.`,
      severity: "critical",
      suggestedDueDate: startOfDay(now),
    });
  }
  return out;
}
