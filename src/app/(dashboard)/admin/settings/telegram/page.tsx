import { requireOrgAdminContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { TelegramLinkForm } from "./telegram-link-form";
import { TelegramChatRow } from "./telegram-chat-row";

export default async function TelegramSettingsPage() {
  const { db } = await requireOrgAdminContext();

  const links = await db.telegramLink.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      telegramChatId: true,
      telegramUsername: true,
      createdAt: true,
    },
  });

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;

  return (
    <div>
      <PageHeader
        title="Telegram"
        description="Vinculá tu cuenta de Telegram para hablar con el copiloto del CRM desde el chat."
      />
      <div className="max-w-xl space-y-6">
        <TelegramLinkForm botUsername={botUsername} />

        <div className="space-y-2 rounded-md border p-4">
          <p className="text-sm font-medium">Chats vinculados</p>
          {links.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no hay chats vinculados a esta organización.
            </p>
          ) : (
            <ul className="divide-y">
              {links.map((link) => (
                <TelegramChatRow key={link.id} link={link} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
