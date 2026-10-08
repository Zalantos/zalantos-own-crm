export const ACTIVITY_PRIORITIES = ["low", "medium", "high"] as const;

export type ActivityPriority = (typeof ACTIVITY_PRIORITIES)[number];

export const ACTIVITY_PRIORITY_LABELS: Record<ActivityPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};
