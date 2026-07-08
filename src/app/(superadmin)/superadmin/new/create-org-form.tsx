"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { createOrganization, type SuperadminFormState } from "../actions";

export function CreateOrgForm() {
  const [state, formAction] = useActionState<SuperadminFormState, FormData>(
    createOrganization,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-md border p-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre de la empresa</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug (opcional)</Label>
        <Input id="slug" name="slug" placeholder="se genera del nombre si se deja vacío" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="currency">Moneda</Label>
          <Input id="currency" name="currency" defaultValue="CLP" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            name="timezone"
            defaultValue="America/Santiago"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="locale">Locale</Label>
          <Input id="locale" name="locale" defaultValue="es-CL" required />
        </div>
      </div>

      {state?.error && <p className="text-destructive text-sm">{state.error}</p>}

      <SubmitButton>Crear organización</SubmitButton>
    </form>
  );
}
