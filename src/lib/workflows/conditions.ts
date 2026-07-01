import type { Condition, WorkflowEvent } from "@/lib/workflows/types";

function matchesCondition(condition: Condition, event: WorkflowEvent) {
  const afterValue = event.after[condition.field];
  const beforeValue = event.before?.[condition.field];

  switch (condition.op) {
    case "eq":
      return afterValue === condition.value;
    case "neq":
      return afterValue !== condition.value;
    case "changed_to":
      return beforeValue !== condition.value && afterValue === condition.value;
    default:
      return false;
  }
}

export function matchesConditions(
  conditions: Condition[],
  event: WorkflowEvent,
) {
  if (conditions.length === 0) return true;
  return conditions.every((condition) => matchesCondition(condition, event));
}
