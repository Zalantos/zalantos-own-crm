import type { PipelineStage } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";

// Plantilla con la que se siembra el pipeline de una organización nueva
// (las 12 etapas históricas de Zalantos); cada org luego lo personaliza.
export const DEFAULT_PIPELINE_STAGES = [
  { key: "lead_identificado", label: "Lead identificado" },
  { key: "investigacion_realizada", label: "Investigación realizada" },
  { key: "primer_contacto", label: "Primer contacto" },
  { key: "reunion_discovery", label: "Reunión discovery" },
  { key: "dolor_validado", label: "Dolor validado" },
  { key: "sprint_0_ofrecido", label: "Sprint 0 ofrecido" },
  { key: "sprint_0_aceptado", label: "Sprint 0 aceptado" },
  { key: "diagnostico_realizado", label: "Diagnóstico realizado" },
  { key: "propuesta_principal", label: "Propuesta principal" },
  { key: "negociacion", label: "Negociación" },
  { key: "ganado", label: "Ganado", isWon: true },
  { key: "perdido", label: "Perdido", isLost: true },
].map((stage, index) => ({
  sortOrder: index,
  isWon: false,
  isLost: false,
  ...stage,
}));

export type StageOption = Pick<
  PipelineStage,
  "id" | "key" | "label" | "color" | "sortOrder" | "isWon" | "isLost"
>;

export async function getOrgStages(db: TenantClient): Promise<StageOption[]> {
  return db.pipelineStage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      key: true,
      label: true,
      color: true,
      sortOrder: true,
      isWon: true,
      isLost: true,
    },
  });
}

export function stagesByKey(stages: StageOption[]) {
  return new Map(stages.map((stage) => [stage.key, stage]));
}

export function stagesById(stages: StageOption[]) {
  return new Map(stages.map((stage) => [stage.id, stage]));
}
