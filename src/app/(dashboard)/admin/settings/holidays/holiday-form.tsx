"use client";

import { useActionState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { createHoliday, type HolidayFormState } from "./actions";

export function HolidayForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<HolidayFormState, FormData>(
    async (previousState, formData) => {
      const result = await createHoliday(previousState, formData);
      if (result?.success) formRef.current?.reset();
      return result;
    },
    undefined,
  );

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-md border p-4"
    >
      <div className="space-y-2">
        <Label htmlFor="holiday-date">Fecha</Label>
        <Input id="holiday-date" name="date" type="date" required />
      </div>
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="holiday-name">Nombre</Label>
        <Input
          id="holiday-name"
          name="name"
          placeholder="Ej: Encuentro de dos mundos"
          required
        />
      </div>
      <SubmitButton>Agregar</SubmitButton>
      {(state?.error || state?.success) && (
        <p
          className={`w-full text-sm ${state.error ? "text-destructive" : "text-emerald-600"}`}
        >
          {state.error ?? state.success}
        </p>
      )}
    </form>
  );
}
