import { addDays } from "date-fns";
import type { TenantClient } from "@/lib/tenant";
import type { Action, WorkflowEvent } from "@/lib/workflows/types";

async function executeCreateActivity(
  db: TenantClient,
  organizationId: string,
  action: Action,
  event: WorkflowEvent,
) {
  const linkField =
    event.entityType === "company"
      ? { companyId: event.entityId }
      : event.entityType === "person"
        ? { personId: event.entityId }
        : event.entityType === "opportunity"
          ? { opportunityId: event.entityId }
          : {};

  await db.activity.create({
    data: {
      organizationId,
      ...linkField,
      type: action.activityType,
      title: action.title,
      description: action.description,
      dueDate: action.dueInDays
        ? addDays(new Date(), action.dueInDays)
        : undefined,
      status: "pending",
    },
  });

  return `Actividad creada: "${action.title}"`;
}

export async function executeAction(
  db: TenantClient,
  organizationId: string,
  action: Action,
  event: WorkflowEvent,
) {
  switch (action.type) {
    case "create_activity":
      return executeCreateActivity(db, organizationId, action, event);
    default:
      throw new Error(`Acción de workflow no soportada: ${action.type}`);
  }
}
