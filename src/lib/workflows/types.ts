import { EntityType } from "@prisma/client";

export type WorkflowTriggerEvent = "stage_changed" | "field_overdue";

export type WorkflowEvent = {
  entityType: EntityType;
  entityId: string;
  eventName: WorkflowTriggerEvent;
  before?: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type Condition = {
  field: string;
  op: "eq" | "neq" | "changed_to";
  value: unknown;
};

export type Action = {
  type: "create_activity";
  title: string;
  activityType: string;
  description?: string;
  dueInDays?: number;
};
