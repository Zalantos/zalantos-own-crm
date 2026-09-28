"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/shared/submit-button";
import { revokeMcpToken, type RevokeMcpTokenState } from "./actions";

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function McpTokenRow({ token }: { token: TokenRow }) {
  const [state, formAction] = useActionState<RevokeMcpTokenState, FormData>(
    revokeMcpToken,
    undefined,
  );

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{token.name}</p>
          {token.revokedAt && (
            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]">
              Revocado
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {token.tokenPrefix} · creado {token.createdAt}
        </p>
        <p className="text-muted-foreground text-xs">
          Último uso: {token.lastUsedAt ?? "nunca"}
        </p>
        {state?.error && (
          <p className="text-destructive text-xs">{state.error}</p>
        )}
        {state?.success && <p className="text-xs">{state.success}</p>}
      </div>
      {!token.revokedAt && (
        <form
          action={formAction}
          onSubmit={(event) => {
            if (!window.confirm(`¿Revocar el token “${token.name}”?`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="tokenId" value={token.id} />
          <SubmitButton pendingText="Revocando...">Revocar</SubmitButton>
        </form>
      )}
    </li>
  );
}
