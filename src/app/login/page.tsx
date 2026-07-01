"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center px-4">
      <div className="bg-background w-full max-w-sm space-y-6 rounded-lg border p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">CRM Zalantos</h1>
          <p className="text-muted-foreground text-sm">
            Inicia sesión para continuar
          </p>
        </div>

        <form action={formAction} className="space-y-4">
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
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {state?.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
