"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { requestPasswordReset, type RequestResetState } from "./actions";

export default function RequestPasswordResetPage() {
  const [state, formAction, pending] = useActionState<
    RequestResetState,
    FormData
  >(requestPasswordReset, undefined);

  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
          <p className="text-muted-foreground text-sm">
            Te enviamos un link para elegir una nueva
          </p>
        </div>

        {state?.sent ? (
          <div className="space-y-3 text-center text-sm">
            <p>Si el email existe, vas a recibir un link para continuar.</p>
            {state.devUrl && (
              <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-left">
                <p className="text-xs font-medium">Link (solo en desarrollo):</p>
                <code className="block truncate text-xs">{state.devUrl}</code>
              </div>
            )}
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Enviando..." : "Enviar link"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
