export const CREATED_VIA_LABELS: Record<string, string> = {
  manual: "Formulario manual",
  agent: "Agente IA",
  meeting: "Meeting Intelligence",
  enrichment: "Enriquecimiento de contexto",
  workflow: "Workflow",
  inbound_lead: "Lead entrante",
  seed: "Datos demo",
  legacy: "Registro previo",
};

export function createdViaLabel(createdVia: string | null | undefined) {
  if (!createdVia) return "Sistema / desconocido";
  return CREATED_VIA_LABELS[createdVia] ?? createdVia;
}

export function actorLabel(
  actor?: { name?: string | null; email?: string | null } | null,
) {
  return actor?.name ?? actor?.email ?? "Sistema / desconocido";
}
