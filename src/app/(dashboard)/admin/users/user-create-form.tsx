"use client";

import { useActionState, useRef } from "react";
import { Role } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { createUser, type UserFormState } from "./actions";

export function UserCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<UserFormState, FormData>(
    async (prevState, formData) => {
      const result = await createUser(prevState, formData);
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
      <p className="text-sm font-medium">Nuevo usuario</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" placeholder="Nombre visible" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña inicial</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Rol</Label>
          <select
            id="role"
            name="role"
            defaultValue={Role.MEMBER}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value={Role.MEMBER}>MEMBER</option>
            <option value={Role.ADMIN}>ADMIN</option>
          </select>
        </div>
      </div>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-muted-foreground text-sm">{state.success}</p>
      )}

      <SubmitButton>Crear usuario</SubmitButton>
    </form>
  );
}
