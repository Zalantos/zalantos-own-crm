// Constantes y reglas puras (seguras para componentes cliente). Los
// servicios con base de datos viven en partner-service.ts.
// Pipeline de alianzas sobre CommercialPartner (no se crean partners
// paralelos). Una alianza no es una oportunidad de venta: genera referidos,
// leads y oportunidades, cuyo reparto económico vive en las ofertas.
export const ALLIANCE_STAGES = [
  "identified",
  "contacted",
  "exploration",
  "negotiation",
  "agreement",
  "active",
] as const;

export type AllianceStage = (typeof ALLIANCE_STAGES)[number];

export const ALLIANCE_STAGE_LABELS: Record<AllianceStage, string> = {
  identified: "Identificado",
  contacted: "Contactado",
  exploration: "Exploración",
  negotiation: "Negociación de alianza",
  agreement: "Acuerdo",
  active: "Activo",
};

export const ALLIANCE_STATUSES = ["open", "paused", "discarded"] as const;
export type AllianceStatus = (typeof ALLIANCE_STATUSES)[number];

export const ALLIANCE_STATUS_LABELS: Record<AllianceStatus, string> = {
  open: "En curso",
  paused: "Pausada",
  discarded: "Descartada",
};

export const ALLIANCE_TYPES = [
  "referral",
  "reseller",
  "implementation",
  "technology",
  "other",
] as const;

export const ALLIANCE_TYPE_LABELS: Record<(typeof ALLIANCE_TYPES)[number], string> = {
  referral: "Referidor",
  reseller: "Revendedor",
  implementation: "Implementación",
  technology: "Tecnológico",
  other: "Otro",
};

export function isAllianceStage(value: unknown): value is AllianceStage {
  return typeof value === "string" && (ALLIANCE_STAGES as readonly string[]).includes(value);
}

export function isAllianceStatus(value: unknown): value is AllianceStatus {
  return typeof value === "string" && (ALLIANCE_STATUSES as readonly string[]).includes(value);
}

export function allianceStageLabel(value: string | null | undefined) {
  if (!value) return "Fuera del pipeline";
  return isAllianceStage(value) ? ALLIANCE_STAGE_LABELS[value] : value;
}

// Reglas puras: "Acuerdo" exige condiciones registradas; pausar/descartar
// exige motivo. Retroceder está permitido.
export function validateAllianceChange(
  current: { allianceStage: string | null; allianceStatus: string; agreementTerms: string | null },
  input: { stage?: AllianceStage | null; status?: AllianceStatus; reason?: string | null; agreementTerms?: string | null },
): { ok: true } | { ok: false; error: string } {
  const status = input.status ?? current.allianceStatus;
  if ((input.status === "paused" || input.status === "discarded") && !input.reason?.trim()) {
    return { ok: false, error: "Indica el motivo para pausar o descartar la alianza." };
  }
  if (input.stage && status !== "open") {
    return { ok: false, error: "Reactivá la alianza antes de moverla de etapa." };
  }
  const terms = input.agreementTerms ?? current.agreementTerms;
  if ((input.stage === "agreement" || input.stage === "active") && !terms?.trim()) {
    return { ok: false, error: "Registra el acuerdo o las condiciones antes de pasar a Acuerdo/Activo." };
  }
  return { ok: true };
}
