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
  changeAllianceAction,
  createAlliancePartner,
  updateAllianceFields,
  type PartnerFormState,
} from "@/app/(dashboard)/partners/actions";
import {
  ALLIANCE_STAGES,
  ALLIANCE_STAGE_LABELS,
  ALLIANCE_TYPES,
  ALLIANCE_TYPE_LABELS,
} from "@/lib/commercial/partners";

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
  const [state, formAction] = usePartnerAction(createAlliancePartner);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Nueva alianza
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva alianza</DialogTitle>
            <DialogDescription>
              Crea el partner en el catálogo y lo ubica en la etapa Identificado.
              Una alianza no es una oportunidad de venta.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Nombre</span>
              <Input name="displayName" required />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Tipo de partner</span>
                <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
                  <option value="company">Empresa del CRM</option>
                  <option value="person">Persona del CRM</option>
                  <option value="external">Externo</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Tipo de alianza</span>
                <select name="allianceType" defaultValue="" className={selectClass}>
                  <option value="">Sin definir</option>
                  {ALLIANCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ALLIANCE_TYPE_LABELS[type]}
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
              <SubmitButton pendingText="Creando...">Crear alianza</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AllianceStageControls({
  partnerId,
  stage,
  status,
}: {
  partnerId: string;
  stage: string | null;
  status: string;
}) {
  const [mode, setMode] = useState<"paused" | "discarded" | "open" | null>(null);
  const [state, formAction] = usePartnerAction(changeAllianceAction.bind(null, partnerId), () => setMode(null));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "open" && (
        <form action={formAction} className="flex items-center gap-2">
          <select name="stage" defaultValue={stage ?? ""} className="bg-background h-8 rounded-md border px-2 text-sm">
            {!stage && <option value="">Fuera del pipeline</option>}
            {ALLIANCE_STAGES.map((value) => (
              <option key={value} value={value}>
                {ALLIANCE_STAGE_LABELS[value]}
              </option>
            ))}
          </select>
          <SubmitButton pendingText="...">Mover</SubmitButton>
        </form>
      )}
      {status === "open" ? (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setMode("paused")}>
            Pausar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode("discarded")}>
            Descartar
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" onClick={() => setMode("open")}>
          Reactivar
        </Button>
      )}
      {state && "error" in state && !mode && <p className="text-destructive text-xs">{state.error}</p>}
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "paused" ? "Pausar alianza" : mode === "discarded" ? "Descartar alianza" : "Reactivar alianza"}
            </DialogTitle>
          </DialogHeader>
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="status" value={mode ?? ""} />
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Motivo</span>
              <Textarea name="reason" rows={2} required={mode !== "open"} />
            </label>
            <ErrorText state={state} />
            <DialogFooter>
              <SubmitButton pendingText="Guardando...">Confirmar</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AllianceFieldsForm({
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
  const [state, formAction] = usePartnerAction(updateAllianceFields.bind(null, partnerId));
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Tipo de alianza</span>
        <select name="allianceType" defaultValue={values.allianceType ?? ""} className={selectClass}>
          <option value="">Sin definir</option>
          {ALLIANCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {ALLIANCE_TYPE_LABELS[type]}
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
        <SubmitButton pendingText="Guardando...">Guardar alianza</SubmitButton>
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
