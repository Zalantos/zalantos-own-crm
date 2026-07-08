import type { TenantClient } from "@/lib/tenant";
import { matchesConditions } from "@/lib/workflows/conditions";
import { executeAction } from "@/lib/workflows/actions";
import type { Action, Condition, WorkflowEvent } from "@/lib/workflows/types";

export async function evaluateWorkflows(
  db: TenantClient,
  organizationId: string,
  event: WorkflowEvent,
) {
  const workflows = await db.workflow.findMany({
    where: {
      isActive: true,
      triggerEntity: event.entityType,
      triggerEvent: event.eventName,
    },
  });

  for (const workflow of workflows) {
    try {
      const conditions = workflow.conditionsJson as unknown as Condition[];
      if (!matchesConditions(conditions, event)) {
        continue;
      }

      const actions = workflow.actionsJson as unknown as Action[];
      const messages: string[] = [];
      for (const action of actions) {
        messages.push(await executeAction(db, organizationId, action, event));
      }

      await db.workflowLog.create({
        data: {
          organizationId,
          workflowId: workflow.id,
          entityType: event.entityType,
          entityId: event.entityId,
          status: "success",
          message: messages.join("; "),
        },
      });
    } catch (error) {
      await db.workflowLog.create({
        data: {
          organizationId,
          workflowId: workflow.id,
          entityType: event.entityType,
          entityId: event.entityId,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
}
