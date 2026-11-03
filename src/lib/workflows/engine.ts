import type { TenantClient } from "@/lib/tenant";
import { matchesConditions } from "@/lib/workflows/conditions";
import { executeAction } from "@/lib/workflows/actions";
import type { Action, Condition, WorkflowEvent } from "@/lib/workflows/types";

// Las acciones no se ejecutan sobre oportunidades cerradas (ganadas,
// perdidas o archivadas), salvo el propio evento de cambio de estado.
async function isClosedOpportunity(db: TenantClient, event: WorkflowEvent) {
  if (event.entityType !== "opportunity" || event.eventName === "status_changed") {
    return false;
  }
  const opportunity = await db.opportunity.findUnique({
    where: { id: event.entityId },
    select: { status: true },
  });
  return (
    !opportunity || ["won", "lost", "archived"].includes(opportunity.status)
  );
}

export async function evaluateWorkflows(
  db: TenantClient,
  organizationId: string,
  event: WorkflowEvent,
) {
  if (await isClosedOpportunity(db, event)) return;
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
        const result = await executeAction(db, organizationId, action, event);
        messages.push(result.message);
        if (event.changeProposalId && result.createdActivity) {
          const sequence = await db.cRMChangeItem.count({
            where: { proposalId: event.changeProposalId },
          });
          const appliedAt = new Date();
          await db.cRMChangeItem.create({
            data: {
              organizationId,
              proposalId: event.changeProposalId,
              type: "create_task",
              entity: "activity",
              entityId: result.createdActivity.id,
              beforeValue: undefined,
              afterValue: {
                title: result.createdActivity.title,
                activityType: result.createdActivity.type,
                dueDate: result.createdActivity.dueDate?.toISOString() ?? null,
                status: result.createdActivity.status,
              },
              label: `Workflow: ${result.createdActivity.title}`,
              before: "—",
              after: result.createdActivity.title,
              confidence: 1,
              explanation: `Actividad creada por workflow "${workflow.name}" como efecto de un cambio de IA.`,
              approved: true,
              requiresApproval: false,
              sequence,
              status: "applied",
              appliedAt,
              undoExpiresAt: new Date(appliedAt.getTime() + 90 * 86_400_000),
              appliedSnapshot: {
                createdEntityId: result.createdActivity.id,
                record: JSON.parse(JSON.stringify(result.createdActivity)),
              },
              revertData: { createdEntityId: result.createdActivity.id },
              causedByItemId: event.causedByItemId ?? null,
            },
          });
        }
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
