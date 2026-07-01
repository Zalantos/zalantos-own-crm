import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import type { Action, WorkflowEvent } from "@/lib/workflows/types";

async function executeCreateActivity(action: Action, event: WorkflowEvent) {
  const linkField =
    event.entityType === "company"
      ? { companyId: event.entityId }
      : event.entityType === "person"
        ? { personId: event.entityId }
        : event.entityType === "opportunity"
          ? { opportunityId: event.entityId }
          : {};

  await prisma.activity.create({
    data: {
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

export async function executeAction(action: Action, event: WorkflowEvent) {
  switch (action.type) {
    case "create_activity":
      return executeCreateActivity(action, event);
    default:
      throw new Error(`Acción de workflow no soportada: ${action.type}`);
  }
}
