import type { Condition, WorkflowEvent } from "@/lib/workflows/types";

// Una condición sobre `stage` puede guardarse con el id de la etapa (UI
// histórica) o con su key (documentación, n8n, agente). El evento trae ambos
// (stage + stageKey) y se acepta cualquiera de los dos.
function candidates(
  values: Record<string, unknown> | undefined,
  field: string,
): unknown[] {
  if (!values) return [undefined];
  if (field === "stage") {
    return [values.stage, values.stageKey].filter((value) => value !== undefined);
  }
  return [values[field]];
}

function equalsAny(values: unknown[], expected: unknown) {
  return values.some((value) => value === expected);
}

function matchesCondition(condition: Condition, event: WorkflowEvent) {
  const after = candidates(event.after, condition.field);
  const before = candidates(event.before, condition.field);

  switch (condition.op) {
    case "eq":
      return equalsAny(after, condition.value);
    case "neq":
      return !equalsAny(after, condition.value);
    case "changed_to":
      return (
        !equalsAny(before, condition.value) && equalsAny(after, condition.value)
      );
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
