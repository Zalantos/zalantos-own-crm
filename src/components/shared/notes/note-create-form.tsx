"use client";

import { useActionState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  createNote,
  type NoteFormState,
} from "@/app/(dashboard)/notes/actions";

export function NoteCreateForm({
  companyId,
  personId,
  opportunityId,
}: {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<NoteFormState, FormData>(
    async (prevState, formData) => {
      const result = await createNote(prevState, formData);
      if (!result) formRef.current?.reset();
      return result;
    },
    undefined,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      {personId && <input type="hidden" name="personId" value={personId} />}
      {opportunityId && (
        <input type="hidden" name="opportunityId" value={opportunityId} />
      )}
      <Input name="title" placeholder="Título (opcional)" />
      <Textarea
        name="body"
        placeholder="Escribe una nota de discovery, contexto o próximos pasos..."
        rows={3}
        required
      />
      {state?.error && (
        <p className="text-destructive text-xs">{state.error}</p>
      )}
      <SubmitButton>Agregar nota</SubmitButton>
    </form>
  );
}
