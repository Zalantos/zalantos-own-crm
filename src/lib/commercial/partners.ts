// Constantes puras (seguras para componentes cliente). Un partner es un actor
// de los procesos comerciales normales: no tiene pipeline propio. Su reparto
// económico vive en las ofertas de cada oportunidad.
export const PARTNER_TYPES = [
  "referral",
  "reseller",
  "implementation",
  "technology",
  "other",
] as const;

export const PARTNER_TYPE_LABELS: Record<(typeof PARTNER_TYPES)[number], string> = {
  referral: "Referidor",
  reseller: "Revendedor",
  implementation: "Implementación",
  technology: "Tecnológico",
  other: "Otro",
};

export function partnerTypeLabel(value: string | null | undefined) {
  if (!value) return "Sin definir";
  return PARTNER_TYPE_LABELS[value as keyof typeof PARTNER_TYPE_LABELS] ?? value;
}

// Etiquetas del pipeline de alianzas retirado, solo para leer el historial.
const LEGACY_ALLIANCE_VALUES: Record<string, string> = {
  identified: "Identificado",
  contacted: "Contactado",
  exploration: "Exploración",
  negotiation: "Negociación de alianza",
  agreement: "Acuerdo",
  active: "Activo",
  open: "En curso",
  paused: "Pausada",
  discarded: "Descartada",
  none: "Sin etapa",
};

export function legacyAllianceLabel(value: string | null | undefined) {
  if (!value) return "—";
  return LEGACY_ALLIANCE_VALUES[value] ?? value;
}
