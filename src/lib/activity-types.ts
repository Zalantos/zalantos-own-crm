export const ACTIVITY_TYPES = [
  "call",
  "email",
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
