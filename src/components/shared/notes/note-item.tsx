"use client";

import { useState, useActionState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  updateNote,
  deleteNote,
  type NoteFormState,
} from "@/app/(dashboard)/notes/actions";
import { actorLabel, createdViaLabel } from "@/lib/traceability";
import { LinkifiedText } from "@/components/shared/linkified-text";
import type { Note } from "@prisma/client";

type NoteWithCreator = Note & {
  createdBy?: { name: string | null; email: string | null } | null;
};

export function NoteItem({ note }: { note: NoteWithCreator }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<NoteFormState, FormData>(
    updateNote,
    undefined,
  );

  if (editing) {
    return (
      <form
        action={async (formData) => {
          await formAction(formData);
          setEditing(false);
        }}
        className="space-y-2 rounded-md border p-3"
      >
        <input type="hidden" name="id" value={note.id} />
        <Input
          name="title"
          defaultValue={note.title ?? ""}
          placeholder="Título (opcional)"
        />
        <Textarea name="body" defaultValue={note.body} rows={4} required />
        {state?.error && (
          <p className="text-destructive text-xs">{state.error}</p>
        )}
        <div className="flex gap-2">
          <SubmitButton>Guardar</SubmitButton>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-1 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          {note.title && <p className="text-sm font-medium">{note.title}</p>}
          <p className="text-muted-foreground text-xs">
            {formatDistanceToNow(note.createdAt, {
              addSuffix: true,
              locale: es,
            })}{" "}
            · {actorLabel(note.createdBy)} · {createdViaLabel(note.createdVia)}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
          >
            Editar
          </Button>
          <form action={deleteNote.bind(null, note.id)}>
            <Button type="submit" variant="ghost" size="sm">
              Eliminar
            </Button>
          </form>
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap">
        <LinkifiedText text={note.body} />
      </p>
    </div>
  );
}
