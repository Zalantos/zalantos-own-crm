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
  changeLeadStatusAction,
  convertLeadAction,
  updateLeadAction,
  type LeadFormState,
} from "@/app/(dashboard)/prospecting/actions";
import { ACTIVITY_TYPE_LABELS, INTERACTION_TYPES } from "@/lib/activity-types";

const selectClass = "bg-background h-9 w-full rounded-md border px-3 text-sm";

type Mode = "contacted" | "lead" | "disqualified" | "prospect" | "convert" | "edit";

const COPY: Record<Exclude<Mode, "convert" | "edit">, { title: string; description: string; submit: string }> = {
  contacted: {
    title: "Registrar primer contacto",
    description: "Un intento de contacto no es una respuesta positiva: solo lo marca como contactado.",
    submit: "Marcar contactado",
  },
  lead: {
    title: "Convertir en lead",
    description: "Manifestó interés o identificamos una necesidad reconocible.",
    submit: "Marcar como lead",
  },
  disqualified: {
    title: "Descartar",
    description: "Sale de la prospección activa; queda en el historial.",
    submit: "Descartar",
  },
  prospect: {
    title: "Volver a prospecto",
    description: "Reabre el registro como prospecto.",
    submit: "Reabrir",
  },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function LeadActions({
  lead,
  companies,
  users,
}: {
  lead: {
    id: string;
    title: string;
    status: string;
    companyId: string | null;
    ownerId: string | null;
    priority: string | null;
    description: string | null;
    interestSignal: string | null;
    defaultOpportunityName: string;
  };
  companies: { id: string; label: string }[];
  users: { id: string; label: string }[];
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  function onDone(result: LeadFormState) {
    if (result && "ok" in result) {
      toast.success(result.message);
      setMode(null);
    }
    return result;
  }
  const [statusState, statusAction] = useActionState<LeadFormState, FormData>(
    async (prev, formData) => onDone(await changeLeadStatusAction(prev, formData)),
    undefined,
  );
  const [convertState, convertAction] = useActionState<LeadFormState, FormData>(convertLeadAction, undefined);
  const [editState, editAction] = useActionState<LeadFormState, FormData>(
    async (prev, formData) => onDone(await updateLeadAction(prev, formData)),
    undefined,
  );

  const error =
    (statusState && "error" in statusState && statusState.error) ||
    (convertState && "error" in convertState && convertState.error) ||
    (editState && "error" in editState && editState.error) ||
    null;
  const canConvert = lead.status === "lead" || lead.status === "converted";

  return (
    <>
      {lead.status === "prospect" && (
        <Button type="button" variant="secondary" onClick={() => setMode("contacted")}>
          Registrar contacto
        </Button>
      )}
      {(lead.status === "prospect" || lead.status === "contacted") && (
        <Button type="button" variant="secondary" onClick={() => setMode("lead")}>
          Es lead
        </Button>
      )}
      {canConvert && (
        <Button type="button" onClick={() => setMode("convert")}>
          {lead.status === "converted" ? "Nueva oportunidad" : "Crear oportunidad"}
        </Button>
      )}
      {["prospect", "contacted", "lead"].includes(lead.status) && (
        <Button type="button" variant="ghost" onClick={() => setMode("disqualified")}>
          Descartar
        </Button>
      )}
      {lead.status === "disqualified" && (
        <Button type="button" variant="secondary" onClick={() => setMode("prospect")}>
          Reabrir
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={() => setMode("edit")}>
        Editar
      </Button>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="sm:max-w-lg">
          {mode && mode !== "convert" && mode !== "edit" && (
            <>
              <DialogHeader>
                <DialogTitle>{COPY[mode].title}</DialogTitle>
                <DialogDescription>{COPY[mode].description}</DialogDescription>
              </DialogHeader>
              <form action={statusAction} className="space-y-3">
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="status" value={mode} />
                {mode === "contacted" && (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">Canal</span>
                        <select name="contactType" required defaultValue="email" className={selectClass}>
                          {INTERACTION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {ACTIVITY_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">Fecha</span>
                        <Input name="contactAt" type="date" defaultValue={today()} max={today()} />
                      </label>
                    </div>
                    <label className="block space-y-1 text-xs">
                      <span className="text-muted-foreground">Qué se envió o habló</span>
                      <Textarea name="contactSummary" rows={2} />
                    </label>
                  </>
                )}
                {mode === "lead" && (
                  <label className="block space-y-1 text-xs">
                    <span className="text-muted-foreground">Señal de interés o necesidad</span>
                    <Textarea name="interestSignal" rows={3} required defaultValue={lead.interestSignal ?? ""} />
                  </label>
                )}
                {(mode === "disqualified" || mode === "prospect") && (
                  <label className="block space-y-1 text-xs">
                    <span className="text-muted-foreground">Motivo</span>
                    <Textarea name="reason" rows={2} required={mode === "disqualified"} />
                  </label>
                )}
                {error && <p className="text-destructive text-xs">{error}</p>}
                <DialogFooter>
                  <SubmitButton pendingText="Guardando...">{COPY[mode].submit}</SubmitButton>
                </DialogFooter>
              </form>
            </>
          )}
          {mode === "convert" && (
            <>
              <DialogHeader>
                <DialogTitle>Crear oportunidad</DialogTitle>
                <DialogDescription>
                  Existe un problema o proyecto concreto. La oportunidad entra en
                  Discovery / Sprint 0 y conserva el origen del lead.
                </DialogDescription>
              </DialogHeader>
              <form action={convertAction} className="space-y-3">
                <input type="hidden" name="id" value={lead.id} />
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">Nombre del negocio</span>
                  <Input name="name" required defaultValue={lead.defaultOpportunityName} />
                </label>
                {!lead.companyId && (
                  <label className="block space-y-1 text-xs">
                    <span className="text-muted-foreground">Empresa</span>
                    <select name="companyId" required className={selectClass}>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">Dolor o necesidad</span>
                  <Textarea name="mainPain" rows={2} defaultValue={lead.interestSignal ?? ""} />
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Próximo paso</span>
                    <Input name="nextStep" placeholder="Agendar Sprint 0" />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Fecha</span>
                    <Input name="nextStepDueDate" type="date" />
                  </label>
                </div>
                {error && <p className="text-destructive text-xs">{error}</p>}
                <DialogFooter>
                  <SubmitButton pendingText="Creando...">Crear oportunidad</SubmitButton>
                </DialogFooter>
              </form>
            </>
          )}
          {mode === "edit" && (
            <>
              <DialogHeader>
                <DialogTitle>Editar prospecto</DialogTitle>
              </DialogHeader>
              <form action={editAction} className="space-y-3">
                <input type="hidden" name="id" value={lead.id} />
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">Nombre</span>
                  <Input name="title" required defaultValue={lead.title} />
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Responsable</span>
                    <select name="ownerId" defaultValue={lead.ownerId ?? ""} className={selectClass}>
                      <option value="">Sin responsable</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Prioridad</span>
                    <select name="priority" defaultValue={lead.priority ?? ""} className={selectClass}>
                      <option value="">Sin prioridad</option>
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>
                </div>
                {!lead.companyId && (
                  <label className="block space-y-1 text-xs">
                    <span className="text-muted-foreground">Vincular empresa</span>
                    <select name="companyId" defaultValue="" className={selectClass}>
                      <option value="">Sin empresa</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">Descripción</span>
                  <Textarea name="description" rows={2} defaultValue={lead.description ?? ""} />
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">Señal de interés</span>
                  <Textarea name="interestSignal" rows={2} defaultValue={lead.interestSignal ?? ""} />
                </label>
                {error && <p className="text-destructive text-xs">{error}</p>}
                <DialogFooter>
                  <SubmitButton pendingText="Guardando...">Guardar</SubmitButton>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
