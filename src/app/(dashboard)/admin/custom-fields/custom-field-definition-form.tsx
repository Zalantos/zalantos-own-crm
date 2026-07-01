"use client";

import { useActionState, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  createCustomFieldDefinition,
  type CustomFieldFormState,
} from "./actions";

const ENTITY_TYPES = ["company", "person", "opportunity"];
const FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "select",
  "multiselect",
];

export function CustomFieldDefinitionForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldType, setFieldType] = useState("text");
  const [state, formAction] = useActionState<CustomFieldFormState, FormData>(
    async (prevState, formData) => {
      const result = await createCustomFieldDefinition(prevState, formData);
      if (!result) formRef.current?.reset();
      return result;
    },
    undefined,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-md border p-4"
    >
      <p className="text-sm font-medium">Nuevo campo custom</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="entityType">Entidad</Label>
          <select
            id="entityType"
            name="entityType"
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {ENTITY_TYPES.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fieldType">Tipo</Label>
          <select
            id="fieldType"
            name="fieldType"
            value={fieldType}
            onChange={(event) => setFieldType(event.target.value)}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fieldName">Nombre interno (camelCase)</Label>
          <Input
            id="fieldName"
            name="fieldName"
            placeholder="fuenteLead"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fieldLabel">Etiqueta visible</Label>
          <Input
            id="fieldLabel"
            name="fieldLabel"
            placeholder="Fuente del lead"
            required
          />
        </div>
        {(fieldType === "select" || fieldType === "multiselect") && (
          <div className="col-span-2 space-y-2">
            <Label htmlFor="optionsJson">Opciones (separadas por coma)</Label>
            <Input
              id="optionsJson"
              name="optionsJson"
              placeholder="Referido, Outbound, Evento"
            />
          </div>
        )}
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isRequired"
            className="border-input h-4 w-4 rounded"
          />
          Campo requerido
        </label>
      </div>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <SubmitButton>Crear campo</SubmitButton>
    </form>
  );
}
