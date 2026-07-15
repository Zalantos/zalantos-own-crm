"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/shared/submit-button";
import { unlinkTelegramChat, type UnlinkState } from "./actions";

type ChatLink = {
  id: string;
  telegramChatId: string;
  telegramUsername: string | null;
  createdAt: Date;
};

export function TelegramChatRow({ link }: { link: ChatLink }) {
  const [state, formAction] = useActionState<UnlinkState, FormData>(
    unlinkTelegramChat,
    undefined,
  );

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {link.telegramUsername ? `@${link.telegramUsername}` : "Chat de Telegram"}
        </p>
        <p className="text-muted-foreground text-xs">
          ID {link.telegramChatId} · vinculado{" "}
          {link.createdAt.toLocaleDateString()}
        </p>
        {state?.error && (
          <p className="text-destructive text-xs">{state.error}</p>
        )}
      </div>
      <form action={formAction}>
        <input type="hidden" name="linkId" value={link.id} />
        <SubmitButton pendingText="Desvinculando...">Desvincular</SubmitButton>
      </form>
    </li>
  );
}
