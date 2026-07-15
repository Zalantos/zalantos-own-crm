"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  generateTelegramLinkCode,
  type GenerateCodeState,
} from "./actions";

export function TelegramLinkForm({
  botUsername,
}: {
  botUsername: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [state, formAction] = useActionState<GenerateCodeState, FormData>(
    generateTelegramLinkCode,
    undefined,
  );

  const command = state?.code ? `/vincular ${state.code}` : null;
  const botHandle = botUsername ? `@${botUsername.replace(/^@/, "")}` : null;

  return (
    <form action={formAction} className="space-y-4 rounded-md border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Vincular mi Telegram</p>
        <p className="text-muted-foreground text-sm">
          Generá un código y envialo{" "}
          {botHandle ? (
            <>
              al bot <span className="font-medium">{botHandle}</span>
            </>
          ) : (
            "al bot del CRM en Telegram"
          )}{" "}
          con el comando que aparece abajo. El código vence en 10 minutos.
        </p>
      </div>

      {state?.error && <p className="text-destructive text-sm">{state.error}</p>}

      {command && (
        <div className="bg-muted/30 space-y-2 rounded-md border p-3">
          <p className="text-xs font-medium">
            Enviá este mensaje al bot en Telegram:
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-background flex-1 truncate rounded border px-2 py-1 text-sm">
              {command}
            </code>
            <button
              type="button"
              className="text-primary text-xs font-medium hover:underline"
              onClick={() => {
                navigator.clipboard.writeText(command);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      <SubmitButton>
        {command ? "Generar código nuevo" : "Generar código"}
      </SubmitButton>
    </form>
  );
}
