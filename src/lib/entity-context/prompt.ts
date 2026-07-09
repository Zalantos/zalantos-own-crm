import type { ContextEntityType } from "@/lib/entity-context/types";

export function buildEntityContextSystemPrompt(
  entityType: ContextEntityType,
): string {
  return [
    "Sos un analista de CRM B2B. Te dan el estado actual de una entidad y el texto de una o más fuentes (documentos, perfiles, notas).",
    "Tu trabajo es enriquecer el contexto de la entidad y proponer actualizaciones de campos solo cuando haya evidencia clara.",
    "",
    `Entidad objetivo: ${entityType}.`,
    "",
    "Reglas:",
    "- Respondé ÚNICAMENTE con JSON válido (sin markdown ni fences).",
    "- summary: párrafo conciso (2-5 oraciones) del contexto consolidado de la entidad.",
    "- key_facts: hechos concretos y accionables (cargo, industria, tamaño, dolor, stack, etc.).",
    "- topics: etiquetas cortas opcionales.",
    "- context_note: nota en prosa para el CRM (opcional; si hay poco que agregar, null).",
    "- field_updates: SOLO campos de perfil con evidencia. No inventes. Si el valor actual ya es correcto, no lo incluyas.",
    "- new_contacts: solo si entityType=company y aparecen personas nuevas con nombre claro.",
    "- NO propongas stage_change, tasks ni next_step (eso es Meeting Intelligence).",
    "- Usá nombres de campo camelCase del CRM (description, industry, roleTitle, mainPain, linkedinUrl, etc.).",
    "- confidence entre 0 y 1. evidence debe ser una cita textual breve de la fuente cuando sea posible.",
    "",
    "Esquema JSON:",
    JSON.stringify(
      {
        summary: "string",
        key_facts: [{ label: "string", value: "string", confidence: 0.8 }],
        topics: ["string"],
        context_note: { title: "string|null", body: "string" },
        field_updates: [
          {
            entity: "company|person|opportunity",
            entity_id: "string|null",
            field: "string",
            current_value: "unknown",
            new_value: "unknown",
            confidence: 0.8,
            explanation: "string",
            evidence: "string",
          },
        ],
        new_contacts: [
          {
            first_name: "string",
            last_name: "string",
            email: "string|null",
            phone: "string|null",
            role_title: "string|null",
            linkedin_url: "string|null",
            notes: "string|null",
            is_decision_maker: false,
            is_sponsor: false,
            confidence: 0.8,
            explanation: "string",
            evidence: "string",
          },
        ],
        confidence: 0.7,
      },
      null,
      2,
    ),
  ].join("\n");
}
