"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
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
import { registerManualContextSource } from "@/app/(dashboard)/entity-context/actions";
import type { ContextEntityType } from "@/lib/entity-context/types";

const MAX_MANUAL_CONTEXT_CHARS = 200_000;

// Enriquecimiento con texto pegado. La subida de archivos se retiró junto con
// la dependencia de almacenamiento: las fuentes históricas siguen disponibles.
export function ContextUploader({
  entityType,
  entityId,
}: {
  entityType: ContextEntityType;
  entityId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Pega un texto para analizar.");
      return;
    }
    if (trimmed.length > MAX_MANUAL_CONTEXT_CHARS) {
      toast.error("El texto supera el máximo de 200.000 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      await registerManualContextSource({ entityType, entityId, title, text: trimmed });
      toast.success("Analizando el texto…");
      setTitle("");
      setText("");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al analizar el texto");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Pega un texto y la IA genera un perfil y propone campos.
        </p>
        <Button type="button" variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
          Pegar texto
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pegar texto de contexto</DialogTitle>
            <DialogDescription>
              Se analiza como una fuente más de esta ficha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título (opcional)"
              disabled={submitting}
            />
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              placeholder="Pega aquí el contenido"
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button type="button" disabled={submitting} onClick={submit}>
              {submitting && <Loader2Icon className="animate-spin" />}
              Analizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
