"use client";

import { useActionState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  createActivity,
  type ActivityFormState,
} from "@/app/(dashboard)/activities/actions";
import type { AssignableTeamMember } from "@/lib/team";

const ACTIVITY_TYPES = ["call", "email", "meeting", "task", "follow_up"];

export function ActivityCreateForm({
  companyId,
  personId,
  opportunityId,
  teamMembers,
}: {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
  teamMembers: AssignableTeamMember[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActivityFormState, FormData>(
    async (prevState, formData) => {
      const result = await createActivity(prevState, formData);
      if (!result) formRef.current?.reset();
      return result;
    },
    undefined,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-2"
    >
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      {personId && <input type="hidden" name="personId" value={personId} />}
      {opportunityId && (
        <input type="hidden" name="opportunityId" value={opportunityId} />
      )}
      <Input
        name="title"
        placeholder="Título de la actividad"
        required
        className="min-w-48"
      />
      <select
        name="type"
        defaultValue="task"
        className="bg-background h-9 rounded-md border px-3 text-sm"
      >
        {ACTIVITY_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select
        name="assigneeId"
        defaultValue=""
        className="bg-background h-9 rounded-md border px-3 text-sm"
      >
        <option value="">Sin responsable</option>
        {teamMembers.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <Input name="dueDate" type="date" className="w-40" />
      <SubmitButton pendingText="Agregando...">Agregar tarea</SubmitButton>
      {state?.error && (
        <p className="text-destructive w-full text-xs">{state.error}</p>
      )}
    </form>
  );
}
