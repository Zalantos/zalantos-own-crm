import { OPERATIONAL_STAGE_KEYS, STAGE_KEYS } from "@/lib/pipeline/stages";

// Hechos mínimos para validar el avance de etapa. Se cargan una vez y se
// evalúan con funciones puras (testeables sin DB).
export type StageGateFacts = {
  status: string;
  mainPain: string | null;
  proposalDecisionAt: Date | null;
  proposalSentAt: Date | null;
  // Alguna versión de oferta con sentAt.
  hasSentOffer: boolean;
  // Interacción registrada (actividad ocurrida o reunión) posterior al envío.
  hasInteractionAfterProposal: boolean;
};

export type StageGateResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string; missing: string[] };

function rank(key: string): number {
  return (OPERATIONAL_STAGE_KEYS as readonly string[]).indexOf(key);
}

// Requisitos obligatorios para ENTRAR a cada etapa operativa. Retroceder no
// exige nada (queda auditado). Saltar etapas exige los requisitos de todas
// las etapas intermedias. Etapas custom de la org no tienen compuertas.
function requirementsFor(key: string, facts: StageGateFacts): string[] {
  switch (key) {
    case STAGE_KEYS.qualified:
      return facts.mainPain?.trim()
        ? []
        : ["Registra el dolor o necesidad (Pain) para evaluar el problema."];
    case STAGE_KEYS.proposalSent: {
      const missing: string[] = [];
      if (!facts.proposalDecisionAt && !facts.proposalSentAt) {
        missing.push("Registra la decisión comercial de preparar/enviar propuesta.");
      }
      if (!facts.proposalSentAt && !facts.hasSentOffer) {
        missing.push(
          "Registra el envío real de la propuesta (fecha de envío u oferta enviada); un documento en preparación no alcanza.",
        );
      }
      return missing;
    }
    case STAGE_KEYS.negotiation:
      return facts.hasInteractionAfterProposal
        ? []
        : [
            "Registra una interacción con el cliente sobre términos, condiciones o decisión posterior al envío de la propuesta.",
          ];
    default:
      return [];
  }
}

export function checkStageTransition(
  fromKey: string | null,
  toKey: string,
  facts: StageGateFacts,
): StageGateResult {
  if (facts.status !== "open") {
    return {
      ok: false,
      error:
        facts.status === "paused"
          ? "La oportunidad está pausada: reactivala antes de moverla de etapa."
          : "La oportunidad está cerrada: reabrila antes de moverla de etapa.",
      missing: [],
    };
  }
  const toRank = rank(toKey);
  if (toRank < 0) return { ok: true, warnings: [] };
  const fromRank = fromKey ? rank(fromKey) : -1;
  if (fromRank >= toRank) return { ok: true, warnings: [] };

  const missing: string[] = [];
  for (let index = Math.max(fromRank + 1, 1); index <= toRank; index += 1) {
    missing.push(...requirementsFor(OPERATIONAL_STAGE_KEYS[index], facts));
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `No se puede avanzar: ${missing.join(" ")}`,
      missing,
    };
  }
  return { ok: true, warnings: [] };
}

// Checklist SPICED / Sprint 0: información deseable (no bloquea).
export type QualificationFacts = {
  situation: string | null;
  mainPain: string | null;
  impact: string | null;
  criticalEvent: string | null;
  decisionProcess: string | null;
};

export const SPICED_LABELS: Record<keyof QualificationFacts, string> = {
  situation: "Situation",
  mainPain: "Pain",
  impact: "Impact",
  criticalEvent: "Critical Event",
  decisionProcess: "Decision",
};

export function spicedCompleteness(facts: QualificationFacts) {
  const entries = (Object.keys(SPICED_LABELS) as (keyof QualificationFacts)[]).map(
    (key) => ({ key, label: SPICED_LABELS[key], done: Boolean(facts[key]?.trim()) }),
  );
  return {
    entries,
    done: entries.filter((entry) => entry.done).length,
    total: entries.length,
  };
}
