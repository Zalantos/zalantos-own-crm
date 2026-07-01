import { mergeCustomFields } from "@/lib/custom-fields/merge";
import { CustomFieldInput } from "@/components/shared/custom-fields/custom-field-input";
import type { EntityType } from "@prisma/client";

export async function CustomFieldsFormSection({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId?: string;
}) {
  const fields = await mergeCustomFields(entityType, entityId);
  if (fields.length === 0) return null;

  return (
    <fieldset className="space-y-4 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">Campos adicionales</legend>
      <div className="grid grid-cols-2 gap-4">
        {fields.map((field) => (
          <CustomFieldInput key={field.definition.id} field={field} />
        ))}
      </div>
    </fieldset>
  );
}
