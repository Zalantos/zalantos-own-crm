import { mergeCustomFields } from "@/lib/custom-fields/merge";
import { requireOrgContext } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkifiedText } from "@/components/shared/linkified-text";
import type { EntityType } from "@prisma/client";
import type { ReactNode } from "react";

function formatValue(
  field: Awaited<ReturnType<typeof mergeCustomFields>>[number],
): ReactNode {
  const { definition, value } = field;
  if (!value) return "—";

  switch (definition.fieldType) {
    case "text":
      return value.valueText ? (
        <LinkifiedText text={value.valueText} />
      ) : (
        "—"
      );
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
  const { db } = await requireOrgContext();
  const fields = await mergeCustomFields(db, entityType, entityId);
  if (fields.length === 0) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Campos adicionales</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.definition.id}>
              <dt className="text-muted-foreground text-xs">
                {field.definition.fieldLabel}
              </dt>
              <dd className="text-sm">{formatValue(field)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
