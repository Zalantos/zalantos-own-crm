import type { LossReason } from "@prisma/client";
import { isLossReason } from "@/lib/opportunities/loss-reason";

// Estado de la oportunidad, independiente de la etapa: una pausada conserva
// su última etapa comercial real y ganadas/perdidas salen del tablero activo.
// `archived` solo existe para registros legacy retirados del pipeline por el
// backfill controlado (ver docs/operations/commercial-process-migration.md).
export const OPPORTUNITY_STATUSES = [
  "open",
  "paused",
  "won",
  "lost",
  "archived",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  open: "Abierta",
  paused: "Pausada",
  won: "Ganada",
  lost: "Perdida",
  archived: "Archivada (legacy)",
};

// Estados que un usuario o el agente pueden fijar (archived no).
export const SETTABLE_OPPORTUNITY_STATUSES = [
  "open",
  "paused",
  "won",
  "lost",
] as const;

export type SettableOpportunityStatus =
  (typeof SETTABLE_OPPORTUNITY_STATUSES)[number];

export function isOpportunityStatus(value: string): value is OpportunityStatus {
  return (OPPORTUNITY_STATUSES as readonly string[]).includes(value);
}

export function opportunityStatusLabel(status: string): string {
  return isOpportunityStatus(status) ? OPPORTUNITY_STATUS_LABELS[status] : status;
}

export type StatusChangeInput = {
  status: SettableOpportunityStatus;
  reason?: string | null;
  // paused
  reactivateAt?: Date | null;
  reactivationCriteria?: string | null;
  // won
  wonEvidence?: string | null;
  closedAt?: Date | null;
  // lost
  lossReason?: LossReason | string | null;
  lossDetail?: string | null;
};

export type StatusChangeData = {
  status: SettableOpportunityStatus;
  statusChangedAt: Date;
  pausedAt: Date | null;
  pauseReason: string | null;
  reactivateAt: Date | null;
  reactivationCriteria: string | null;
  wonAt: Date | null;
  wonEvidence: string | null;
  lostAt: Date | null;
  lossReason: LossReason | null;
  lossDetail: string | null;
  closedById: string | null;
};

export type StatusTransitionResult =
  | { ok: true; data: StatusChangeData }
  | { ok: false; error: string; field?: string };

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Reglas de transición (puras, compartidas por UI, agente, MCP y apply):
// - paused: motivo + (fecha o criterio de reactivación).
// - won: evidencia verificable del compromiso formal; fecha no futura.
// - lost: motivo (enum).
// - open: reabrir/reactivar exige motivo si venía de won/lost.
// Una oportunidad archivada no cambia de estado (es legacy).
export function buildStatusChange(
  current: { status: string },
  input: StatusChangeInput,
  actorId: string | null,
  now: Date = new Date(),
): StatusTransitionResult {
  if (current.status === "archived") {
    return {
      ok: false,
      error: "La oportunidad está archivada (registro legacy) y no cambia de estado.",
    };
  }
  if (current.status === input.status) {
    return { ok: false, error: `La oportunidad ya está en estado ${input.status}.` };
  }

  const base: StatusChangeData = {
    status: input.status,
    statusChangedAt: now,
    pausedAt: null,
    pauseReason: null,
    reactivateAt: null,
    reactivationCriteria: null,
    wonAt: null,
    wonEvidence: null,
    lostAt: null,
    lossReason: null,
    lossDetail: null,
    closedById: null,
  };

  switch (input.status) {
    case "paused": {
      const reason = clean(input.reason);
      if (!reason) {
        return { ok: false, field: "reason", error: "Indica el motivo de la pausa." };
      }
      const criteria = clean(input.reactivationCriteria);
      if (!input.reactivateAt && !criteria) {
        return {
          ok: false,
          field: "reactivateAt",
          error: "Indica una fecha o un criterio de reactivación.",
        };
      }
      return {
        ok: true,
        data: {
          ...base,
          pausedAt: now,
          pauseReason: reason,
          reactivateAt: input.reactivateAt ?? null,
          reactivationCriteria: criteria,
        },
      };
    }
    case "won": {
      const evidence = clean(input.wonEvidence);
      if (!evidence) {
        return {
          ok: false,
          field: "wonEvidence",
          error:
            "Registra la evidencia del compromiso formal (contrato firmado, OC, aceptación escrita).",
        };
      }
      const closedAt = input.closedAt ?? now;
      if (closedAt.getTime() > now.getTime() + 60_000) {
        return { ok: false, field: "closedAt", error: "La fecha de cierre no puede ser futura." };
      }
      return {
        ok: true,
        data: { ...base, wonAt: closedAt, wonEvidence: evidence, closedById: actorId },
      };
    }
    case "lost": {
      if (!input.lossReason || !isLossReason(input.lossReason)) {
        return { ok: false, field: "lossReason", error: "Indica el motivo de pérdida." };
      }
      const closedAt = input.closedAt ?? now;
      return {
        ok: true,
        data: {
          ...base,
          lostAt: closedAt,
          lossReason: input.lossReason,
          lossDetail: clean(input.lossDetail) ?? clean(input.reason),
          closedById: actorId,
        },
      };
    }
    case "open": {
      if ((current.status === "won" || current.status === "lost") && !clean(input.reason)) {
        return {
          ok: false,
          field: "reason",
          error: "Indica por qué se reabre una oportunidad cerrada.",
        };
      }
      return { ok: true, data: base };
    }
  }
}

export function isClosedStatus(status: string): boolean {
  return status === "won" || status === "lost" || status === "archived";
}
