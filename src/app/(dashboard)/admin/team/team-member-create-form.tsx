"use client";

import { useActionState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { createTeamMember, type TeamMemberFormState } from "./actions";

export type LinkableUser = {
  id: string;
  name: string | null;
  email: string;
};

export function TeamMemberCreateForm({
  availableUsers,
}: {
  availableUsers: LinkableUser[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<TeamMemberFormState, FormData>(
    async (prevState, formData) => {
      const result = await createTeamMember(prevState, formData);
      if (!result?.error) formRef.current?.reset();
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
      <div>
        <p className="text-sm font-medium">Nueva persona del equipo</p>
        <p className="text-muted-foreground text-xs">
          Elige un usuario de Zalantos para vincularlo, o deja el usuario vacío
          y escribe el nombre de una persona externa.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="team-userId">Usuario de Zalantos</Label>
          <select
            id="team-userId"
            name="userId"
            defaultValue=""
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Sin usuario (persona externa)</option>
            {availableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name ?? user.email}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-name">Nombre</Label>
          <Input
            id="team-name"
            name="name"
            placeholder="Requerido si es externa"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-email">Email (opcional)</Label>
          <Input id="team-email" name="email" type="email" />
        </div>
      </div>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-muted-foreground text-sm">{state.success}</p>
      )}

      <SubmitButton pendingText="Agregando...">Agregar persona</SubmitButton>
    </form>
  );
}
