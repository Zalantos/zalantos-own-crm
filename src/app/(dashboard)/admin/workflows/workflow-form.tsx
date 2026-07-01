"use client";

import { useActionState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { createWorkflow, type WorkflowFormState } from "./actions";

const ENTITY_TYPES = ["company", "person", "opportunity", "activity"];
const TRIGGER_EVENTS = ["stage_changed", "field_overdue"];

export function WorkflowForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<WorkflowFormState, FormData>(
    async (prevState, formData) => {
      const result = await createWorkflow(prevState, formData);
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
      <p className="text-sm font-medium">Nuevo workflow</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre" name="name" required />
        <div className="space-y-2">
          <Label htmlFor="triggerEntity">Entidad disparadora</Label>
          <select
            id="triggerEntity"
            name="triggerEntity"
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
          <Label htmlFor="triggerEvent">Evento</Label>
          <select
            id="triggerEvent"
            name="triggerEvent"
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {TRIGGER_EVENTS.map((event) => (
              <option key={event} value={event}>
                {event}
              </option>
            ))}
          </select>
        </div>
        <Field label="Descripción" name="description" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="conditionsJson">
          {
            'Condiciones (JSON, ej: [{"field":"stage","op":"changed_to","value":"reunion_discovery"}])'
          }
        </Label>
        <Textarea
          id="conditionsJson"
          name="conditionsJson"
          rows={2}
          defaultValue="[]"
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="actionsJson">
          {
            'Acciones (JSON, ej: [{"type":"create_activity","title":"...","activityType":"follow_up"}])'
          }
        </Label>
        <Textarea
          id="actionsJson"
          name="actionsJson"
          rows={2}
          defaultValue="[]"
          className="font-mono text-xs"
        />
      </div>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <SubmitButton>Crear workflow</SubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  required,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required={required} />
    </div>
  );
}
