"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { HistoryIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAgentPageContext } from "@/hooks/use-agent-context";
import {
  deleteAgentThread,
  getAgentThreadMessages,
  listAgentThreads,
} from "@/app/(dashboard)/agent/actions";
import { AgentChat } from "./agent-chat";

type ThreadSummary = { id: string; title: string | null; updatedAt: Date };

// Launcher + right-side copilot panel. Mounted in the topbar so it is
// available on every dashboard page.
export function AgentPanel() {
  const [view, setView] = useState<"chat" | "threads">("chat");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  // Remounts AgentChat (and its useChat state) when switching conversations.
  const [chatKey, setChatKey] = useState(0);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const context = useAgentPageContext();

  function startNewChat() {
    setThreadId(null);
    setInitialMessages([]);
    setChatKey((key) => key + 1);
    setView("chat");
  }

  async function showThreads() {
    setThreads(await listAgentThreads());
    setView("threads");
  }

  async function openThread(id: string) {
    const messages = await getAgentThreadMessages(id);
    setThreadId(id);
    setInitialMessages(messages);
    setChatKey((key) => key + 1);
    setView("chat");
  }

  async function removeThread(id: string) {
    await deleteAgentThread(id);
    setThreads((current) => current.filter((thread) => thread.id !== id));
    if (threadId === id) startNewChat();
  }

  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="outline" size="sm" />}
        aria-label="Abrir copiloto"
      >
        <SparklesIcon className="size-4" />
        Copiloto
      </SheetTrigger>
      <SheetContent
        side="right"
        className="gap-0"
        style={{ width: "min(440px, 100vw)", maxWidth: "none" }}
      >
        <SheetHeader className="flex-row items-center justify-between border-b pr-12">
          <SheetTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4" />
            Copiloto
          </SheetTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={showThreads}
              aria-label="Historial de conversaciones"
            >
              <HistoryIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={startNewChat}
              aria-label="Nueva conversación"
            >
              <PlusIcon />
            </Button>
          </div>
        </SheetHeader>

        {view === "chat" ? (
          <AgentChat
            key={chatKey}
            threadId={threadId}
            initialMessages={initialMessages}
            context={context}
            onThreadCreated={setThreadId}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {threads.length === 0 ? (
              <p className="text-muted-foreground p-4 text-center text-sm">
                Todavía no hay conversaciones.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    className="hover:bg-muted/50 group flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => openThread(thread.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm">
                        {thread.title || "Sin título"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(thread.updatedAt).toLocaleString("es-AR")}
                      </p>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => removeThread(thread.id)}
                      aria-label="Eliminar conversación"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
