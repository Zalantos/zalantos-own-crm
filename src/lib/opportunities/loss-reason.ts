import { LossReason } from "@prisma/client";

export const LOSS_REASONS = Object.values(LossReason) as LossReason[];

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  PRICE: "Precio",
  CHOSE_COMPETITOR: "Eligió a la competencia",
  NO_BUDGET: "Sin presupuesto",
  DEPRIORITIZED: "No es prioridad o se postergó",
  SOLVED_INTERNALLY: "Lo resolvió internamente",
  CONTACT_OR_ORG_CHANGE: "Cambio de interlocutor o de la organización",
  NO_RESPONSE: "Sin respuesta del cliente",
  NOT_QUALIFIED: "No calificaba",
  OTHER: "Otro",
};

export function isLossReason(value: unknown): value is LossReason {
  return (
    typeof value === "string" && (LOSS_REASONS as string[]).includes(value)
  );
}
