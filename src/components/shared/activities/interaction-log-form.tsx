"use client";

import { useActionState, useState } from "react";
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
import { SubmitButton } from "@/components/shared/submit-button";
import {
  logInteraction,
  type InteractionFormState,
} from "@/app/(dashboard)/activities/actions";
import {
  ACTIVITY_TYPE_LABELS,
  INTERACTION_TYPES,
  type InteractionType,
} from "@/lib/activity-types";

function nowLocalInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

// Registra algo que YA ocurrió (no una tarea). Disponible en fichas de
// oportunidad, prospecto, partner, empresa y persona.
export function InteractionLogForm({
  companyId,
  personId,
  opportunityId,
  commercialLeadId,
  commercialPartnerId,
  people = [],
  offerMarkContacted = false,
  triggerLabel = "Registrar interacción",
  defaultType = "email",
}: {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
  commercialLeadId?: string;
  commercialPartnerId?: string;
  people?: { id: string; label: string }[];
  offerMarkContacted?: boolean;
  triggerLabel?: string;
  defaultType?: InteractionType;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>(defaultType);
  const isMeeting = type === "meeting";
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = useActionState<InteractionFormState, FormData>(
    async (prev, formData) => {
      const result = await logInteraction(prev, formData);
      if (result && "success" in result) {
        toast.success(result.message);
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isMeeting ? "Registrar reunión" : "Registrar interacción"}</DialogTitle>
            <DialogDescription>
              Algo que ya ocurrió: un correo, WhatsApp, llamada, mensaje de
              LinkedIn o reunión. Para algo pendiente crea una tarea.
            </DialogDescription>
          </DialogHeader>
          <form key={formKey} action={formAction} className="space-y-3">
            {companyId && <input type="hidden" name="companyId" value={companyId} />}
            {opportunityId && (
              <input type="hidden" name="opportunityId" value={opportunityId} />
            )}
            {commercialLeadId && (
              <input type="hidden" name="commercialLeadId" value={commercialLeadId} />
            )}
            {commercialPartnerId && (
              <input
                type="hidden"
                name="commercialPartnerId"
                value={commercialPartnerId}
              />
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Canal</span>
                <select
                  name="type"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                >
                  {INTERACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ACTIVITY_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Fecha y hora</span>
                <Input
                  name="occurredAt"
                  type="datetime-local"
                  defaultValue={nowLocalInput()}
                  required
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Título</span>
              <Input name="title" placeholder="Ej.: Envío de propuesta por email" required />
            </label>
            {personId ? (
              <input type="hidden" name="personId" value={personId} />
            ) : people.length > 0 && isMeeting ? (
              <fieldset className="space-y-1 text-xs">
                <legend className="text-muted-foreground">Participantes</legend>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                  {people.map((person) => (
                    <label key={person.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="participantIds" value={person.id} />
                      {person.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : people.length > 0 ? (
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Persona</span>
                <select
                  name="personId"
                  defaultValue=""
                  className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="">Sin persona</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">{isMeeting ? "Resumen" : "Descripción"}</span>
              <Textarea name="description" rows={isMeeting ? 4 : 2} />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">
                {isMeeting ? "Acuerdos y próximas acciones" : "Resultado"}
              </span>
              <Textarea
                name="outcomes"
                rows={isMeeting ? 3 : 2}
                placeholder="Ej.: Pidió revisar el alcance con su gerente"
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Duración (min)</span>
              <Input name="durationMinutes" type="number" min={0} className="w-24" />
            </label>
            {offerMarkContacted && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="markContacted" defaultChecked />
                Es un intento de contacto: marcar el prospecto como contactado
              </label>
            )}
            {state && "error" in state && (
              <p className="text-destructive text-xs">{state.error}</p>
            )}
            <DialogFooter>
              <SubmitButton pendingText="Guardando...">Registrar</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
