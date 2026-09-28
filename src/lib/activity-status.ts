export const ACTIVITY_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  todo: "Por hacer",
  in_progress: "En curso",
  blocked: "Bloqueada",
  done: "Hecha",
};

// Mutable (no "as const"): Prisma's `{ in: [...] }` filters expect a
// plain string[], not a readonly tuple.
export const ACTIVITY_OPEN_STATUSES: ActivityStatus[] = [
  "todo",
  "in_progress",
  "blocked",
];

// Orden de columnas del tablero; también usado para ordenar listas donde
// antes se confiaba en el orden alfabético de "pending"/"completed".
export const ACTIVITY_STATUS_RANK: Record<ActivityStatus, number> = {
  todo: 0,
  in_progress: 1,
  blocked: 2,
  done: 3,
};

export function isActivityStatus(value: string): value is ActivityStatus {
  return (ACTIVITY_STATUSES as readonly string[]).includes(value);
}
