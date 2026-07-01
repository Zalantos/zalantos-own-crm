import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldInputName } from "@/lib/custom-fields/merge";
import type { MergedCustomField } from "@/lib/custom-fields/merge";

export function CustomFieldInput({ field }: { field: MergedCustomField }) {
  const { definition, value } = field;
  const name = fieldInputName(definition.id);
  const options = Array.isArray(definition.optionsJson)
    ? (definition.optionsJson as string[])
    : [];

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {definition.fieldLabel}
        {definition.isRequired && (
          <span className="text-destructive ml-0.5">*</span>
        )}
      </Label>

      {definition.fieldType === "text" && (
        <Input
          id={name}
          name={name}
          defaultValue={value?.valueText ?? ""}
          required={definition.isRequired}
        />
      )}

      {definition.fieldType === "number" && (
        <Input
          id={name}
          name={name}
          type="number"
          defaultValue={value?.valueNumber?.toString() ?? ""}
          required={definition.isRequired}
        />
      )}

      {definition.fieldType === "boolean" && (
        <input
          id={name}
          name={name}
          type="checkbox"
          defaultChecked={value?.valueBoolean ?? false}
          className="border-input h-4 w-4 rounded"
        />
      )}

      {definition.fieldType === "date" && (
        <Input
          id={name}
          name={name}
          type="date"
          defaultValue={
            value?.valueDate
              ? new Date(value.valueDate).toISOString().slice(0, 10)
              : ""
          }
          required={definition.isRequired}
        />
      )}

      {definition.fieldType === "select" && (
        <select
          id={name}
          name={name}
          defaultValue={value?.valueText ?? ""}
          required={definition.isRequired}
          className="bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="">Seleccionar...</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {definition.fieldType === "multiselect" && (
        <div className="flex flex-wrap gap-3">
          {options.map((option) => {
            const selected = Array.isArray(value?.valueJson)
              ? (value.valueJson as string[]).includes(option)
              : false;
            return (
              <label key={option} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  value={option}
                  defaultChecked={selected}
                  className="border-input h-4 w-4 rounded"
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
