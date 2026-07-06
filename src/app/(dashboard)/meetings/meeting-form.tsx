"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { createMeeting, updateMeeting } from "./actions";
import { serializeParticipants } from "@/lib/zod/meeting";
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

type MeetingFormData = {
  id: string;
  companyId: string;
  opportunityId: string | null;
  title: string;
  meetingType: string;
  meetingDate: Date;
  participants: unknown;
};

function formatMeetingDateForInput(meetingDate: Date) {
  return new Date(meetingDate).toISOString().slice(0, 16);
}

export function MeetingForm({
  companies,
  defaultCompanyId,
  meeting,
}: {
  companies: CompanyOption[];
  defaultCompanyId?: string;
  meeting?: MeetingFormData;
}) {
  const action = meeting ? updateMeeting : createMeeting;
  const [state, formAction] = useActionState<FormState, FormData>(
    action,
    undefined,
  );
  const [companyId, setCompanyId] = useState(
    meeting?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "",
  );

  const opportunities =
    companies.find((company) => company.id === companyId)?.opportunities ?? [];

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {meeting && <input type="hidden" name="id" value={meeting.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="companyId">Empresa</Label>
          <select
            id="companyId"
            name="companyId"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
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
            defaultValue={meeting?.opportunityId ?? ""}
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
          <Input
            id="title"
            name="title"
            defaultValue={meeting?.title}
            required
          />
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
            defaultValue={meeting?.meetingType ?? "discovery"}
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
            defaultValue={
              meeting ? formatMeetingDateForInput(meeting.meetingDate) : undefined
            }
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
          defaultValue={
            meeting ? serializeParticipants(meeting.participants) : undefined
          }
          placeholder="Un participante por línea. Ej: Ana Pérez, ana@cliente.com"
        />
      </div>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <SubmitButton>
        {meeting ? "Guardar cambios" : "Crear reunión"}
      </SubmitButton>
    </form>
  );
}
