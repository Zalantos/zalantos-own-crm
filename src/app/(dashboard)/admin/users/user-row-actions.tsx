"use client";

import { useActionState } from "react";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  resetUserPassword,
  toggleUserActive,
  updateUserRole,
  type UserFormState,
} from "./actions";

export function UserRoleForm({ id, role }: { id: string; role: Role }) {
  const [state, formAction] = useActionState<UserFormState, FormData>(
    updateUserRole.bind(null, id),
    undefined,
  );

  return (
    <form action={formAction} className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          name="role"
          defaultValue={role}
          className="bg-background h-8 rounded-md border px-2 text-xs"
        >
          <option value={Role.MEMBER}>MEMBER</option>
          <option value={Role.ADMIN}>ADMIN</option>
        </select>
        <SubmitButton pendingText="...">Guardar</SubmitButton>
      </div>
      {state?.error && (
        <p className="text-destructive max-w-56 text-xs">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-muted-foreground text-xs">{state.success}</p>
      )}
    </form>
  );
}

export function UserActiveForm({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState<UserFormState>(
    toggleUserActive.bind(null, id, !isActive),
    undefined,
  );

  return (
    <form action={formAction} className="space-y-1">
      <Button
        type="submit"
        variant={isActive ? "destructive" : "outline"}
        size="sm"
      >
        {isActive ? "Desactivar" : "Activar"}
      </Button>
      {state?.error && (
        <p className="text-destructive max-w-56 text-xs">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-muted-foreground text-xs">{state.success}</p>
      )}
    </form>
  );
}

export function UserResetPasswordForm({ id }: { id: string }) {
  const [state, formAction] = useActionState<UserFormState, FormData>(
    resetUserPassword.bind(null, id),
    undefined,
  );

  return (
    <form action={formAction} className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          name="password"
          type="password"
          minLength={8}
          placeholder="Nueva contraseña"
          autoComplete="new-password"
          className="h-8 w-44 text-xs"
          required
        />
        <SubmitButton pendingText="...">Resetear</SubmitButton>
      </div>
      {state?.error && (
        <p className="text-destructive max-w-56 text-xs">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-muted-foreground text-xs">{state.success}</p>
      )}
    </form>
  );
}
