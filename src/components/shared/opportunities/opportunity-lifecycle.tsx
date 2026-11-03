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
  changeOpportunityStatusAction,
  recordProposalAction,
  requestRumboHandoffAction,
  type ActionResult,
} from "@/app/(dashboard)/opportunities/actions";
import { LOSS_REASONS, LOSS_REASON_LABELS } from "@/lib/opportunities/loss-reason";

const selectClass = "bg-background h-9 w-full rounded-md border px-3 text-sm";

function today() {
  return new Date().toISOString().slice(0, 10);
}

type ResultAction = (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;

// Envuelve la server action: el feedback y el cierre ocurren al resolverse
// la acción (no en un efecto posterior).
function useResultAction(action: ResultAction, onSuccess: () => void) {
  return useActionState<ActionResult | undefined, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) {
      toast.success(result.message ?? "Guardado.");
      onSuccess();
    } else {
      toast.error(result.error);
    }
    return result;
  }, undefined);
}

type StatusMode = "paused" | "won" | "lost" | "open";

const TITLES: Record<StatusMode, { title: string; description: string; submit: string }> = {
  paused: {
    title: "Pausar oportunidad",
    description: "Hay interés pero no puede avanzar ahora. Conserva su etapa y sale del tablero activo.",
    submit: "Pausar",
  },
  won: {
    title: "Marcar como ganada",
    description: "Requiere un compromiso comercial formal verificable. Ganada no equivale a factura pagada.",
    submit: "Marcar ganada",
  },
  lost: {
    title: "Marcar como perdida",
    description: "La oportunidad fue descartada. El motivo es obligatorio.",
    submit: "Marcar perdida",
  },
  open: {
    title: "Reactivar / reabrir",
    description: "Vuelve al tablero activo en su etapa. Queda auditado.",
    submit: "Reactivar",
  },
};

function StatusDialog({
  opportunityId,
  mode,
  onClose,
  reactivationStages,
}: {
  opportunityId: string;
  mode: StatusMode;
  onClose: () => void;
  reactivationStages: { id: string; label: string }[] | null;
}) {
  const [state, formAction] = useResultAction(changeOpportunityStatusAction, onClose);
  const copy = TITLES[mode];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={opportunityId} />
          <input type="hidden" name="status" value={mode} />
          {mode === "won" && (
            <>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Evidencia del compromiso</span>
                <Textarea name="wonEvidence" rows={3} required placeholder="Contrato firmado el..., OC N°..., aceptación por email de..." />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Fecha de cierre</span>
                <Input name="closedAt" type="date" defaultValue={today()} max={today()} />
              </label>
            </>
          )}
          {mode === "lost" && (
            <>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Motivo</span>
                <select name="lossReason" required defaultValue="" className={selectClass}>
                  <option value="" disabled>
                    Seleccionar...
                  </option>
                  {LOSS_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {LOSS_REASON_LABELS[reason]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Detalle</span>
                <Textarea name="lossDetail" rows={2} />
              </label>
            </>
          )}
          {mode === "paused" && (
            <>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Motivo de la pausa</span>
                <Textarea name="reason" rows={2} required placeholder="Ej.: sin presupuesto hasta el próximo año fiscal" />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">Fecha de reactivación</span>
                  <Input name="reactivateAt" type="date" min={today()} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">o criterio</span>
                  <Input name="reactivationCriteria" placeholder="Cuando aprueben presupuesto" />
                </label>
              </div>
            </>
          )}
          {mode === "open" && (
            <>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Motivo</span>
                <Textarea name="reason" rows={2} />
              </label>
              {reactivationStages && (
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    Su etapa fue retirada: elegí la etapa activa donde retoma
                  </span>
                  <select name="reactivateStageId" required className={selectClass}>
                    {reactivationStages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          {state && !state.ok && <p className="text-destructive text-xs">{state.error}</p>}
          <DialogFooter>
            <SubmitButton pendingText="Guardando...">{copy.submit}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OpportunityStatusActions({
  opportunityId,
  status,
  reactivationStages,
}: {
  opportunityId: string;
  status: string;
  // Etapas para reubicar si la etapa actual fue retirada (si no, null).
  reactivationStages: { id: string; label: string }[] | null;
}) {
  const [mode, setMode] = useState<StatusMode | null>(null);
  if (status === "archived") return null;
  return (
    <>
      {status === "open" && (
        <>
          <Button type="button" variant="secondary" onClick={() => setMode("paused")}>
            Pausar
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode("lost")}>
            Perdida
          </Button>
          <Button type="button" onClick={() => setMode("won")}>
            Ganada
          </Button>
        </>
      )}
      {status === "paused" && (
        <>
          <Button type="button" variant="secondary" onClick={() => setMode("lost")}>
            Perdida
          </Button>
          <Button type="button" onClick={() => setMode("open")}>
            Reactivar
          </Button>
        </>
      )}
      {(status === "won" || status === "lost") && (
        <Button type="button" variant="secondary" onClick={() => setMode("open")}>
          Reabrir
        </Button>
      )}
      {mode && (
        <StatusDialog
          opportunityId={opportunityId}
          mode={mode}
          onClose={() => setMode(null)}
          reactivationStages={mode === "open" ? reactivationStages : null}
        />
      )}
    </>
  );
}

export function ProposalActions({
  opportunityId,
  hasDecision,
  sentAt,
}: {
  opportunityId: string;
  hasDecision: boolean;
  sentAt: string | null;
}) {
  const [mode, setMode] = useState<"decision" | "sent" | null>(null);
  const [state, formAction] = useResultAction(recordProposalAction, () => setMode(null));
  return (
    <div className="flex flex-wrap gap-2">
      {!hasDecision && !sentAt && (
        <Button type="button" size="sm" variant="secondary" onClick={() => setMode("decision")}>
          Registrar decisión de proponer
        </Button>
      )}
      <Button type="button" size="sm" variant="secondary" onClick={() => setMode("sent")}>
        {sentAt ? "Corregir envío de propuesta" : "Registrar propuesta enviada"}
      </Button>
      {mode && (
        <Dialog open onOpenChange={(open) => !open && setMode(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {mode === "decision" ? "Decisión de preparar/enviar propuesta" : "Propuesta enviada"}
              </DialogTitle>
              <DialogDescription>
                {mode === "decision"
                  ? "Habilita el avance desde Calificada. No implica que la propuesta se haya enviado."
                  : "Solo cuando el cliente recibió la propuesta formal; un documento en preparación no cuenta."}
              </DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="id" value={opportunityId} />
              <input type="hidden" name="mode" value={mode} />
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Fecha</span>
                <Input name="sentAt" type="date" defaultValue={sentAt?.slice(0, 10) ?? today()} max={today()} required />
              </label>
              {mode === "sent" && (
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">Respuesta esperada</span>
                  <Input name="expectedResponseAt" type="date" min={today()} />
                </label>
              )}
              {state && !state.ok && <p className="text-destructive text-xs">{state.error}</p>}
              <DialogFooter>
                <SubmitButton pendingText="Guardando...">Registrar</SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function RumboHandoffButton({
  opportunityId,
  defaultProjectName,
  users,
  defaultResponsibleId,
  label,
}: {
  opportunityId: string;
  defaultProjectName: string;
  users: { id: string; name: string | null; email: string }[];
  defaultResponsibleId: string | null;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useResultAction(requestRumboHandoffAction, () => setOpen(false));
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Traspasar a Rumbo</DialogTitle>
            <DialogDescription>
              Envía el contexto comercial para iniciar la ejecución. Las tareas
              comerciales no se copian. El traspaso queda pendiente hasta que
              Rumbo confirme.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="id" value={opportunityId} />
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Nombre del proyecto</span>
              <Input name="projectName" defaultValue={defaultProjectName} required />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Fecha de inicio</span>
                <Input name="startDate" type="date" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Responsable</span>
                <select name="responsibleUserId" defaultValue={defaultResponsibleId ?? ""} className={selectClass}>
                  <option value="">Sin definir</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name ?? user.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Alcance acordado</span>
              <Textarea name="scopeSummary" rows={3} placeholder="Si se omite se usa el resumen de la oferta aceptada/enviada" />
            </label>
            {state && !state.ok && <p className="text-destructive text-xs">{state.error}</p>}
            <DialogFooter>
              <SubmitButton pendingText="Enviando...">Enviar a Rumbo</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
