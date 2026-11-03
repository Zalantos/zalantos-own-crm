"use client";

import { useActionState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import { createCampaign, type CampaignFormState } from "./actions";

export function CampaignForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<CampaignFormState, FormData>(
    async (prev, formData) => {
      const result = await createCampaign(prev, formData);
      if (result && "ok" in result) formRef.current?.reset();
      return result;
    },
    undefined,
  );
  return (
    <form ref={formRef} action={formAction} className="grid max-w-3xl grid-cols-1 gap-2 rounded-md border p-4 sm:grid-cols-2">
      <Input name="name" placeholder="Nombre de la campaña" required />
      <Input name="key" placeholder="Key / utm_campaign (opcional)" />
      <Input name="channel" placeholder="Canal (LinkedIn Ads, email...)" />
      <div className="flex gap-2">
        <Input name="startsAt" type="date" aria-label="Inicio" />
        <Input name="endsAt" type="date" aria-label="Fin" />
      </div>
      {state && "error" in state && <p className="text-destructive text-xs sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Creando...">Crear campaña</SubmitButton>
      </div>
    </form>
  );
}
