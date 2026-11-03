import type { PipelineStage } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";

// Pipeline operativo de oportunidades (HU-CRM-02). Los keys son estables y
// se conservan de la versión anterior para no romper workflows, webhooks ni
// el historial de cambios IA: reunion_discovery = "Discovery / Sprint 0" y
// propuesta_principal = "Propuesta enviada". Ganada, perdida y pausada son
// estados de la oportunidad, no etapas del tablero.
export const STAGE_KEYS = {
  discovery: "reunion_discovery",
  qualified: "calificada",
  proposalSent: "propuesta_principal",
  negotiation: "negociacion",
} as const;

export const OPERATIONAL_STAGE_KEYS = [
  STAGE_KEYS.discovery,
  STAGE_KEYS.qualified,
  STAGE_KEYS.proposalSent,
  STAGE_KEYS.negotiation,
] as const;

// Plantilla con la que se siembra el pipeline de una organización nueva.
export const DEFAULT_PIPELINE_STAGES = [
  { key: STAGE_KEYS.discovery, label: "Discovery / Sprint 0" },
  { key: STAGE_KEYS.qualified, label: "Calificada" },
  { key: STAGE_KEYS.proposalSent, label: "Propuesta enviada" },
  { key: STAGE_KEYS.negotiation, label: "Negociación" },
].map((stage, index) => ({
  sortOrder: index,
  isWon: false,
  isLost: false,
  ...stage,
}));

// Alias aceptados por el agente/MCP/n8n. Las etapas legacy de prospección y
// terminales no son etapas: se traducen a acciones (ver
// LEGACY_STAGE_ACTIONS) en vez de fallar con un error opaco.
export const STAGE_KEY_ALIASES: Record<string, string> = {
  discovery: STAGE_KEYS.discovery,
  sprint_0: STAGE_KEYS.discovery,
  sprint0: STAGE_KEYS.discovery,
  dolor_validado: STAGE_KEYS.discovery,
  sprint_0_ofrecido: STAGE_KEYS.discovery,
  sprint_0_aceptado: STAGE_KEYS.discovery,
  diagnostico_realizado: STAGE_KEYS.discovery,
  qualified: STAGE_KEYS.qualified,
  calificado: STAGE_KEYS.qualified,
  propuesta_enviada: STAGE_KEYS.proposalSent,
  proposal_sent: STAGE_KEYS.proposalSent,
  propuesta: STAGE_KEYS.proposalSent,
  negotiation: STAGE_KEYS.negotiation,
  negociación: STAGE_KEYS.negotiation,
};

export const LEGACY_STAGE_ACTIONS: Record<string, string> = {
  ganado:
    "Ganado ya no es una etapa: usá set_opportunity_status con status=won y la evidencia del compromiso.",
  perdido:
    "Perdido ya no es una etapa: usá set_opportunity_status con status=lost y el motivo.",
  congelado:
    "Congelado ya no es una etapa: usá set_opportunity_status con status=paused, motivo y fecha o criterio de reactivación.",
  lead_identificado:
    "Lead identificado pertenece a Prospección: usá create_prospect / update_lead_status en vez de una etapa de oportunidad.",
  investigacion_realizada:
    "Investigación realizada pertenece a Prospección: usá create_prospect / update_lead_status.",
  primer_contacto:
    "Primer contacto pertenece a Prospección: usá update_lead_status con status=contacted.",
};

export function normalizeStageKey(value: string): string {
  const key = value.trim().toLowerCase();
  return STAGE_KEY_ALIASES[key] ?? key;
}

export type StageOption = Pick<
  PipelineStage,
  "id" | "key" | "label" | "color" | "sortOrder" | "isWon" | "isLost"
>;

const stageSelect = {
  id: true,
  key: true,
  label: true,
  color: true,
  sortOrder: true,
  isWon: true,
  isLost: true,
} as const;

// Etapas activas (configurables por org). Incluye etapas terminales creadas
// por un admin; el tablero usa getBoardStages.
export async function getOrgStages(db: TenantClient): Promise<StageOption[]> {
  return db.pipelineStage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: stageSelect,
  });
}

// Todas las etapas, incluidas las retiradas: para mostrar la etapa real de
// oportunidades históricas (ganadas en "Ganado", pausadas en "Congelado").
export async function getAllOrgStages(
  db: TenantClient,
): Promise<(StageOption & { isActive: boolean })[]> {
  return db.pipelineStage.findMany({
    orderBy: { sortOrder: "asc" },
    select: { ...stageSelect, isActive: true },
  });
}

// Columnas del tablero: etapas activas no terminales.
export function boardStages(stages: StageOption[]): StageOption[] {
  return stages.filter((stage) => !stage.isWon && !stage.isLost);
}

export function stagesByKey(stages: StageOption[]) {
  return new Map(stages.map((stage) => [stage.key, stage]));
}

export function stagesById(stages: StageOption[]) {
  return new Map(stages.map((stage) => [stage.id, stage]));
}

// Resuelve key, alias o id contra las etapas activas.
export function resolveStage(
  stages: StageOption[],
  value: string,
): StageOption | undefined {
  const byKey = stagesByKey(stages);
  return (
    byKey.get(value) ??
    byKey.get(normalizeStageKey(value)) ??
    stages.find((stage) => stage.id === value)
  );
}
