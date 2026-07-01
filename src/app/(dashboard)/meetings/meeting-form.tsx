"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { createMeeting } from "./actions";
import type { FormState } from "./types";

const MEETING_TYPES = [
  "discovery",
  "seguimiento",
  "negociacion",
  "cierre",
  "otro",
];

type CompanyOption = {
  id: string;
  name: string;
  opportunities: { id: string; name: string }[];
};

export function MeetingForm({
  companies,
  defaultCompanyId,
}: {
  companies: CompanyOption[];
  defaultCompanyId?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    createMeeting,
    undefined,
  );
  const [companyId, setCompanyId] = useState(
    defaultCompanyId ?? companies[0]?.id ?? "",
  );

  const opportunities =
    companies.find((c) => c.id === companyId)?.opportunities ?? [];

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="companyId">Empresa</Label>
          <select
            id="companyId"
            name="companyId"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            required
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="opportunityId">Oportunidad (opcional)</Label>
          <select
            id="opportunityId"
            name="opportunityId"
            defaultValue=""
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Sin oportunidad</option>
            {opportunities.map((opportunity) => (
              <option key={opportunity.id} value={opportunity.id}>
                {opportunity.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Título</Label>
          <Input id="title" name="title" required />
          {state?.fieldErrors?.title && (
            <p className="text-destructive text-xs">
              {state.fieldErrors.title[0]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="meetingType">Tipo</Label>
          <select
            id="meetingType"
            name="meetingType"
            defaultValue="discovery"
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {MEETING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="meetingDate">Fecha</Label>
          <Input
            id="meetingDate"
            name="meetingDate"
            type="datetime-local"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="participants">Participantes</Label>
        <Textarea
          id="participants"
          name="participants"
          rows={3}
          placeholder="Un participante por línea. Ej: Ana Pérez, ana@cliente.com"
        />
      </div>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <SubmitButton>Crear reunión</SubmitButton>
    </form>
  );
}
