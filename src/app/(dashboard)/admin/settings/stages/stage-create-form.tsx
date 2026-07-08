"use client";

import { useActionState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { createStage, type StageFormState } from "./actions";

export function StageCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<StageFormState, FormData>(
    async (prevState, formData) => {
      const result = await createStage(prevState, formData);
      if (!result?.error) formRef.current?.reset();
      return result;
    },
    undefined,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-md border p-4"
    >
      <div className="min-w-40 flex-1 space-y-2">
        <Label htmlFor="label">Nueva etapa</Label>
        <Input id="label" name="label" placeholder="Ej: Demo agendada" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="color">Color</Label>
        <Input
          id="color"
          name="color"
          type="color"
          defaultValue="#64748b"
          className="h-9 w-14 p-1"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="outcome">Resultado</Label>
        <select
          id="outcome"
          name="outcome"
          defaultValue="none"
          className="bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="none">Normal</option>
          <option value="won">Ganada</option>
          <option value="lost">Perdida</option>
        </select>
      </div>
      <SubmitButton>Agregar</SubmitButton>
      {state?.error && (
        <p className="text-destructive w-full text-sm">{state.error}</p>
      )}
    </form>
  );
}
