"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { createFirstAdmin, type InviteFormState } from "../actions";

export function InviteAdminForm({ orgId }: { orgId: string }) {
  const [copied, setCopied] = useState(false);
  const [state, formAction] = useActionState<InviteFormState, FormData>(
    createFirstAdmin.bind(null, orgId),
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-md border p-4">
      <p className="text-sm font-medium">Invitar administrador</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" placeholder="Nombre visible" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
      </div>

      {state?.error && <p className="text-destructive text-sm">{state.error}</p>}

      {state?.inviteUrl && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium">
            Copia este link y envíaselo al admin (vence en 7 días):
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-background flex-1 truncate rounded border px-2 py-1 text-xs">
              {state.inviteUrl}
            </code>
            <button
              type="button"
              className="text-primary text-xs font-medium hover:underline"
              onClick={() => {
                navigator.clipboard.writeText(state.inviteUrl!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      <SubmitButton>Crear invitación</SubmitButton>
    </form>
  );
}
