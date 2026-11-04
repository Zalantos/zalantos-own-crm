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
  addPartnerContact,
  createPartner,
  updatePartnerFields,
  type PartnerFormState,
} from "@/app/(dashboard)/partners/actions";
import { PARTNER_TYPES, PARTNER_TYPE_LABELS } from "@/lib/commercial/partners";

const selectClass = "bg-background h-9 w-full rounded-md border px-3 text-sm";
type Option = { id: string; label: string };

type PartnerAction = (prev: PartnerFormState, formData: FormData) => Promise<PartnerFormState>;

// Feedback y cierre al resolverse la acción (no en un efecto posterior).
function usePartnerAction(action: PartnerAction, onSuccess?: () => void) {
  return useActionState<PartnerFormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result && "ok" in result) {
      toast.success(result.message);
      onSuccess?.();
    }
    return result;
  }, undefined);
}

function ErrorText({ state }: { state: PartnerFormState }) {
  return state && "error" in state ? <p className="text-destructive text-xs">{state.error}</p> : null;
}

export function NewPartnerButton({
  companies,
  people,
  users,
}: {
  companies: Option[];
  people: Option[];
  users: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("company");
  const [state, formAction] = usePartnerAction(createPartner);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Nuevo partner
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo partner</DialogTitle>
            <DialogDescription>
              Agrega una relación comercial al directorio. Sus negocios se
              registran como actores en prospectos y oportunidades.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Nombre</span>
              <Input name="displayName" required />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Origen</span>
                <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
                  <option value="company">Empresa del CRM</option>
                  <option value="person">Persona del CRM</option>
                  <option value="external">Externo</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Tipo de partner</span>
                <select name="allianceType" defaultValue="" className={selectClass}>
                  <option value="">Sin definir</option>
                  {PARTNER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PARTNER_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {kind === "company" && (
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Empresa</span>
                <select name="linkedCompanyId" required className={selectClass}>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === "person" && (
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Persona</span>
                <select name="linkedPersonId" required className={selectClass}>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Responsable</span>
              <select name="ownerId" className={selectClass}>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Potencial comercial</span>
              <Textarea name="commercialPotential" rows={2} />
            </label>
            <ErrorText state={state} />
            <DialogFooter>
              <SubmitButton pendingText="Creando...">Crear partner</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PartnerFieldsForm({
  partnerId,
  values,
  users,
}: {
  partnerId: string;
  values: {
    allianceType: string | null;
    ownerId: string | null;
    commercialPotential: string | null;
    potentialValue: string | null;
    agreementTerms: string | null;
    agreementSignedAt: string | null;
  };
  users: Option[];
}) {
  const [state, formAction] = usePartnerAction(updatePartnerFields.bind(null, partnerId));
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Tipo de partner</span>
        <select name="allianceType" defaultValue={values.allianceType ?? ""} className={selectClass}>
          <option value="">Sin definir</option>
          {PARTNER_TYPES.map((type) => (
            <option key={type} value={type}>
              {PARTNER_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Responsable</span>
        <select name="ownerId" defaultValue={values.ownerId ?? ""} className={selectClass}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-xs sm:col-span-2">
        <span className="text-muted-foreground">Potencial comercial</span>
        <Textarea name="commercialPotential" rows={2} defaultValue={values.commercialPotential ?? ""} />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Valor potencial estimado</span>
        <Input name="potentialValue" type="number" defaultValue={values.potentialValue ?? ""} />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Acuerdo firmado el</span>
        <Input name="agreementSignedAt" type="date" defaultValue={values.agreementSignedAt ?? ""} />
      </label>
      <label className="space-y-1 text-xs sm:col-span-2">
        <span className="text-muted-foreground">Acuerdo o condiciones (comisiones por negocio viven en cada oferta)</span>
        <Textarea name="agreementTerms" rows={3} defaultValue={values.agreementTerms ?? ""} />
      </label>
      <div className="sm:col-span-2">
        <ErrorText state={state} />
        <SubmitButton pendingText="Guardando...">Guardar</SubmitButton>
      </div>
    </form>
  );
}

export function AddPartnerContactForm({ partnerId, people }: { partnerId: string; people: Option[] }) {
  const [state, formAction] = usePartnerAction(addPartnerContact.bind(null, partnerId));
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="personId" required className="bg-background h-9 min-w-48 flex-1 rounded-md border px-2 text-sm">
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.label}
          </option>
        ))}
      </select>
      <Input name="role" placeholder="Rol (opcional)" className="w-40" />
      <SubmitButton pendingText="...">Agregar</SubmitButton>
      <ErrorText state={state} />
    </form>
  );
}
