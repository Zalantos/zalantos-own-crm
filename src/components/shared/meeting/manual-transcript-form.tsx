"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { addManualTranscript } from "@/app/(dashboard)/meetings/evidence-actions";
import type { FormState } from "@/app/(dashboard)/meetings/types";

export function ManualTranscriptForm({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<FormState, FormData>(
    async (prevState, formData) => {
      const result = await addManualTranscript(prevState, formData);
      if (!result) {
        formRef.current?.reset();
        router.refresh();
      }
      return result;
    },
    undefined,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="meetingId" value={meetingId} />
      <Textarea
        name="text"
        rows={5}
        required
        placeholder="Pegá acá una transcripción o minuta manual..."
      />
      {state?.error && (
        <p className="text-destructive text-xs">{state.error}</p>
      )}
      <SubmitButton pendingText="Agregando...">
        Agregar transcripción
      </SubmitButton>
    </form>
  );
}
