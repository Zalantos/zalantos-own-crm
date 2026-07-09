"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  FileTextIcon,
  Loader2Icon,
  PaperclipIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PageContext } from "@/lib/agent/context";
import { ensureAgentThread } from "@/app/(dashboard)/agent/actions";
import { MessageParts } from "./message-parts";

const SUGGESTIONS = [
  "¿Qué oportunidades tengo abiertas?",
  "Resumime esta empresa",
  "Creá una tarea de seguimiento para mañana",
];

const MAX_AGENT_ATTACHMENT_BYTES = 15 * 1024 * 1024;

type AgentChatProps = {
  threadId: string | null;
  initialMessages: UIMessage[];
  context: PageContext | null;
  onThreadCreated: (threadId: string) => void;
};

export function AgentChat({
  threadId,
  initialMessages,
  context,
  onThreadCreated,
}: AgentChatProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<
    { id: string; filename: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  // Ref (not state) so the first submit can create the thread and use its id
  // in the same tick without re-rendering the chat.
  const threadIdRef = useRef<string | null>(threadId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/agent/chat" }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function ensureThread(): Promise<string> {
    let currentThreadId = threadIdRef.current;
    if (!currentThreadId) {
      const { threadId: createdId } = await ensureAgentThread(context);
      threadIdRef.current = createdId;
      currentThreadId = createdId;
      onThreadCreated(createdId);
    }
    return currentThreadId;
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || uploading) return;

    const currentThreadId = await ensureThread();
    sendMessage(
      { text: trimmed },
      { body: { threadId: currentThreadId, context } },
    );
    setInput("");
    // Attachments stay tied to the thread server-side; the chips are only
    // pre-send feedback.
    setAttachments([]);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const currentThreadId = await ensureThread();
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("threadId", currentThreadId);
        const response = await fetch("/api/agent/attachments", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json();
        if (!response.ok) {
          toast.error(payload.error ?? `No se pudo subir ${file.name}`);
          continue;
        }
        setAttachments((current) => [
          ...current,
          { id: payload.id, filename: payload.filename },
        ]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function uploadManualText() {
    const text = manualText.trim();
    if (!text) {
      toast.error("Pegá un texto para adjuntar.");
      return;
    }
    if (new TextEncoder().encode(text).byteLength > MAX_AGENT_ATTACHMENT_BYTES) {
      toast.error("El texto supera el máximo de 15 MB.");
      return;
    }

    setManualSubmitting(true);
    try {
      const currentThreadId = await ensureThread();
      const formData = new FormData();
      formData.append("text", text);
      formData.append("filename", manualTitle);
      formData.append("threadId", currentThreadId);

      const response = await fetch("/api/agent/attachments", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "No se pudo adjuntar el texto");
        return;
      }

      setAttachments((current) => [
        ...current,
        { id: payload.id, filename: payload.filename },
      ]);
      toast.success("Texto adjuntado.");
      setManualTitle("");
      setManualText("");
      setManualOpen(false);
    } finally {
      setManualSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 text-center text-sm">
            <p>
              Preguntame por empresas, oportunidades y contactos, o pedime
              cambios en el CRM.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="hover:bg-muted rounded-md border px-3 py-1.5 text-xs"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground ml-8 self-end rounded-lg px-3 py-2 whitespace-pre-wrap"
                    : "mr-2",
                )}
              >
                {message.role === "user" ? (
                  message.parts
                    .map((part) => (part.type === "text" ? part.text : ""))
                    .join("")
                ) : (
                  <MessageParts message={message} />
                )}
              </div>
            ))}
            {busy && (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2Icon className="size-3 animate-spin" />
                Pensando…
              </div>
            )}
            {error && (
              <p className="text-destructive text-xs">
                Ocurrió un error: {error.message}
              </p>
            )}
          </div>
        )}
      </div>

      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
      >
        {(attachments.length > 0 || uploading) && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="text-muted-foreground inline-flex max-w-48 items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
              >
                <FileTextIcon className="size-3 shrink-0" />
                <span className="truncate">{attachment.filename}</span>
              </span>
            ))}
            {uploading && (
              <span className="text-muted-foreground inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
                <Loader2Icon className="size-3 animate-spin" />
                Procesando…
              </span>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => void uploadFiles(event.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={uploading || manualSubmitting}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Adjuntar documento"
          >
            <PaperclipIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={uploading || manualSubmitting}
            onClick={() => setManualOpen(true)}
            aria-label="Pegar contexto"
          >
            <FileTextIcon />
          </Button>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit(input);
              }
            }}
            placeholder="Escribí una orden o pregunta…"
            rows={2}
            className="max-h-32 min-h-0 resize-none text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || uploading || !input.trim()}
          >
            <SendIcon />
            <span className="sr-only">Enviar</span>
          </Button>
        </div>
      </form>
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pegar contexto</DialogTitle>
            <DialogDescription>
              El texto quedará adjunto a este chat para que la IA lo use.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value)}
              placeholder="Título opcional"
              maxLength={120}
            />
            <Textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder="Pegá o escribí el contexto…"
              className="max-h-72 min-h-40 resize-y"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={manualSubmitting}
              onClick={() => setManualOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={manualSubmitting || !manualText.trim()}
              onClick={() => void uploadManualText()}
            >
              {manualSubmitting && <Loader2Icon className="animate-spin" />}
              Adjuntar texto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
