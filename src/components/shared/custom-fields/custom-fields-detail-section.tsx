import { mergeCustomFields } from "@/lib/custom-fields/merge";
import type { EntityType } from "@prisma/client";

function formatValue(
  field: Awaited<ReturnType<typeof mergeCustomFields>>[number],
) {
  const { definition, value } = field;
  if (!value) return "—";

  switch (definition.fieldType) {
    case "text":
    case "select":
      return value.valueText || "—";
    case "number":
      return value.valueNumber?.toString() ?? "—";
    case "boolean":
      return value.valueBoolean ? "Sí" : "No";
    case "date":
      return value.valueDate
        ? new Date(value.valueDate).toLocaleDateString()
        : "—";
    case "multiselect":
      return Array.isArray(value.valueJson) && value.valueJson.length > 0
        ? (value.valueJson as string[]).join(", ")
        : "—";
    default:
      return "—";
  }
}

export async function CustomFieldsDetailSection({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: string;
}) {
  const fields = await mergeCustomFields(entityType, entityId);
  if (fields.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border p-4">
      <p className="text-sm font-medium">Campos adicionales</p>
      <dl className="grid grid-cols-2 gap-3">
        {fields.map((field) => (
          <div key={field.definition.id}>
            <dt className="text-muted-foreground text-xs">
              {field.definition.fieldLabel}
            </dt>
            <dd className="text-sm">{formatValue(field)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
