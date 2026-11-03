export const ACTIVITY_TYPES = [
  "call",
  "email",
  "whatsapp",
  "linkedin",
  "meeting",
  "task",
  "follow_up",
  "visit",
  "other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  meeting: "Reunión",
  task: "Tarea",
  follow_up: "Seguimiento",
  visit: "Visita",
  other: "Otra",
};

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function activityTypeLabel(type: string): string {
  return isActivityType(type) ? ACTIVITY_TYPE_LABELS[type] : type;
}

// Canales de interacción comercial (actividad registrada = algo que ocurrió).
export const INTERACTION_TYPES = [
  "email",
  "whatsapp",
  "call",
  "linkedin",
  "meeting",
  "other",
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export function isInteractionType(value: string): value is InteractionType {
  return (INTERACTION_TYPES as readonly string[]).includes(value);
}
