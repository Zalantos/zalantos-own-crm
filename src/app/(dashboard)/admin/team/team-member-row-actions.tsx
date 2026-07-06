"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  deleteTeamMember,
  linkTeamMemberUser,
  toggleTeamMemberActive,
  type TeamMemberFormState,
} from "./actions";
import type { LinkableUser } from "./team-member-create-form";

function FormMessages({ state }: { state: TeamMemberFormState }) {
  return (
    <>
      {state?.error && (
        <p className="text-destructive max-w-56 text-xs">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-muted-foreground text-xs">{state.success}</p>
      )}
    </>
  );
}

export function TeamMemberLinkForm({
  id,
  userId,
  linkedUserLabel,
  availableUsers,
}: {
  id: string;
  userId: string | null;
  linkedUserLabel: string | null;
  availableUsers: LinkableUser[];
}) {
  const [state, formAction] = useActionState<TeamMemberFormState, FormData>(
    linkTeamMemberUser.bind(null, id),
    undefined,
  );

  return (
    <form action={formAction} className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          name="userId"
          defaultValue={userId ?? ""}
          className="bg-background h-8 rounded-md border px-2 text-xs"
        >
          <option value="">Sin usuario</option>
          {/* El usuario ya vinculado no está entre los disponibles: se agrega
              como opción para que el select refleje el estado actual. */}
          {userId && (
            <option value={userId}>{linkedUserLabel ?? userId}</option>
          )}
          {availableUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name ?? user.email}
            </option>
          ))}
        </select>
        <SubmitButton pendingText="...">Vincular</SubmitButton>
      </div>
      <FormMessages state={state} />
    </form>
  );
}

export function TeamMemberActiveForm({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState<TeamMemberFormState>(
    toggleTeamMemberActive.bind(null, id, !isActive),
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
      <FormMessages state={state} />
    </form>
  );
}

export function TeamMemberDeleteForm({ id }: { id: string }) {
  const [state, formAction] = useActionState<TeamMemberFormState>(
    deleteTeamMember.bind(null, id),
    undefined,
  );

  return (
    <form action={formAction} className="space-y-1">
      <Button type="submit" variant="ghost" size="sm">
        Eliminar
      </Button>
      <FormMessages state={state} />
    </form>
  );
}
