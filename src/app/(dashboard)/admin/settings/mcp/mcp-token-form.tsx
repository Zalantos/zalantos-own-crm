"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { createMcpToken, type CreateMcpTokenState } from "./actions";

export function McpTokenForm({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState<"token" | "config" | null>(null);
  const [state, formAction] = useActionState<CreateMcpTokenState, FormData>(
    createMcpToken,
    undefined,
  );
  const config = state?.token
    ? JSON.stringify(
        {
          mcpServers: {
            "zalantos-crm": {
              url: endpoint,
              headers: { Authorization: `Bearer ${state.token}` },
            },
          },
        },
        null,
        2,
      )
    : null;

  function copy(value: string, target: "token" | "config") {
    void navigator.clipboard.writeText(value);
    setCopied(target);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <form action={formAction} className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Crear token personal</p>
          <p className="text-muted-foreground text-sm">
            Poné un nombre que identifique el cliente donde vas a usarlo.
          </p>
        </div>
        <Input
          id="mcp-token-name"
          name="name"
          placeholder="Ej: Cursor laptop"
          maxLength={80}
          required
        />
        {state?.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        <SubmitButton pendingText="Creando...">Crear token</SubmitButton>
      </form>

      {state?.token && config && (
        <div className="bg-muted/30 space-y-3 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Guardá este token ahora</p>
            <p className="text-muted-foreground text-xs">
              Se muestra una sola vez. No podremos recuperarlo después.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-background min-w-0 flex-1 rounded border px-2 py-1 text-xs break-all select-all">
              {state.token}
            </code>
            <button
              type="button"
              className="text-primary text-xs font-medium hover:underline"
              onClick={() => copy(state.token!, "token")}
            >
              {copied === "token" ? "Copiado" : "Copiar"}
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">Configuración para Cursor</p>
            <pre className="bg-background max-h-72 overflow-auto rounded border p-3 text-xs whitespace-pre-wrap">
              {config}
            </pre>
            <button
              type="button"
              className="text-primary text-xs font-medium hover:underline"
              onClick={() => copy(config, "config")}
            >
              {copied === "config" ? "Configuración copiada" : "Copiar JSON"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
