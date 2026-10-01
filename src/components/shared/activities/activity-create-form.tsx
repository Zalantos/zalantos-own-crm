"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { SubmitButton } from "@/components/shared/submit-button";
import { TeamMemberSelect } from "@/components/shared/activities/team-member-select";
import {
  createActivity,
  type ActivityFormState,
} from "@/app/(dashboard)/activities/actions";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from "@/lib/activity-types";
import type { AssignableTeamMember } from "@/lib/team";

function ActivityCreateDialogForm({
  companyId,
  personId,
  opportunityId,
  teamMembers,
  onCreated,
}: {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
  teamMembers: AssignableTeamMember[];
  onCreated: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const createdRef = useRef(false);
  const [state, formAction, pending] = useActionState<
    ActivityFormState,
    FormData
  >(async (prevState, formData) => {
    const result = await createActivity(prevState, formData);
    if (!result) {
      formRef.current?.reset();
      createdRef.current = true;
    }
    return result;
  }, undefined);

  // Cerrar después de que termine la transición (incluye el refresh del
  // servidor). Cerrar dentro de la action corta la animación del diálogo.
  useEffect(() => {
    if (pending || !createdRef.current) return;
    createdRef.current = false;
    onCreated();
  }, [pending, onCreated]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      {personId && <input type="hidden" name="personId" value={personId} />}
      {opportunityId && (
        <input type="hidden" name="opportunityId" value={opportunityId} />
      )}
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Título</span>
        <Input name="title" placeholder="Título de la actividad" required />
      </label>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Tipo</span>
        <select
          name="type"
          defaultValue="task"
          className="bg-background h-8 w-full rounded-md border px-2 text-sm"
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Responsable</span>
        <TeamMemberSelect
          teamMembers={teamMembers}
          name="assigneeId"
          className="w-full text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Fecha planeada</span>
          <Input name="plannedDate" type="date" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Fecha límite</span>
          <Input name="dueDate" type="date" />
        </label>
      </div>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Descripción</span>
        <Textarea
          name="description"
          placeholder="Descripción (opcional)"
          rows={2}
        />
      </label>
      {state?.error && (
        <p className="text-destructive text-xs">{state.error}</p>
      )}
      <DialogFooter>
        <SubmitButton pendingText="Agregando...">
          Agregar actividad
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

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
  const [open, setOpen] = useState(false);
  // El form sigue montado mientras el diálogo cierra. Desmontarlo en el
  // mismo render que open=false corta la animación y deja el popup visible.
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setFormKey((key) => key + 1);
  }

  return (
    <>
      <Button type="button" onClick={() => handleOpenChange(true)}>
        Agregar actividad
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar actividad</DialogTitle>
            <DialogDescription>
              Tipo, fechas y responsable de la actividad.
            </DialogDescription>
          </DialogHeader>
          <ActivityCreateDialogForm
            key={formKey}
            companyId={companyId}
            personId={personId}
            opportunityId={opportunityId}
            teamMembers={teamMembers}
            onCreated={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
