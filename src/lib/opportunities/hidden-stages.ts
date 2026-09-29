// Preferencia de vista (lista y tablero), no dato de tenant. La escribe
// setHiddenOpportunityStages en una cookie httpOnly para que Perdido u otras
// etapas no vuelvan a aparecer en cada carga. Los ids ajenos a la org se
// ignoran al cruzarlos con las etapas activas.
export const HIDDEN_STAGES_COOKIE = "opportunity-hidden-stages";
export const HIDDEN_STAGES_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function idsFromJson(raw: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed
    .filter(
      (id): id is string =>
        typeof id === "string" && id.length > 0 && id.length <= 64,
    )
    .slice(0, 100);
}

export function parseHiddenStageIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const direct = idsFromJson(raw);
  if (direct) return direct;
  try {
    return idsFromJson(decodeURIComponent(raw)) ?? [];
  } catch {
    return [];
  }
}

export function knownHiddenStageIds(
  hiddenStageIds: string[],
  stages: { id: string }[],
): string[] {
  const known = new Set(stages.map((stage) => stage.id));
  return hiddenStageIds.filter((id) => known.has(id));
}

export function opportunityStageWhere(
  hiddenStageIds: string[],
  explicitStageId?: string,
):
  | { stageId: string }
  | { stageId: { notIn: string[] } }
  | Record<string, never> {
  if (explicitStageId) return { stageId: explicitStageId };
  if (hiddenStageIds.length === 0) return {};
  return { stageId: { notIn: hiddenStageIds } };
}
