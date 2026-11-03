"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  completeNextAction,
  saveNextAction,
  suggestNextActionAI,
  type NextActionFormState,
} from "@/app/(dashboard)/commercial/follow-up-actions";
import {
  NEXT_STEP_CHANNELS,
  NEXT_STEP_CHANNEL_LABELS,
  nextActionState,
  nextStepChannelLabel,
  type NextActionSuggestion,
} from "@/lib/commercial/next-action";
import {
  ACTIVITY_TYPE_LABELS,
  INTERACTION_TYPES,
  isInteractionType,
} from "@/lib/activity-types";
import type { NextActionEntity } from "@/lib/commercial/opportunity-service";

export type NextActionValue = {
  nextStep: string | null;
  nextStepDueDate: string | null;
  nextStepChannel: string | null;
  nextStepContext: string | null;
  nextStepActivityId: string | null;
};

type Draft = {
  nextStep: string;
  nextStepDueDate: string;
  nextStepChannel: string;
  nextStepContext: string;
};

const STATE_BADGE = {
  missing: { label: "Sin definir", variant: "destructive" },
  undated: { label: "Sin fecha", variant: "outline" },
  overdue: { label: "Vencida", variant: "destructive" },
  scheduled: { label: "Programada", variant: "success" },
} as const;

function dayOffset(days: number | null) {
  if (days == null) return "";
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function NextActionFields({
  draft,
  openTasks,
  currentActivityId,
}: {
  draft: Draft;
  openTasks: { id: string; title: string }[];
  currentActivityId: string | null;
}) {
  return (
    <>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Acción concreta</span>
        <Input name="nextStep" defaultValue={draft.nextStep} placeholder="Ej.: Llamar al decisor para confirmar recepción" />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Fecha</span>
          <Input name="nextStepDueDate" type="date" defaultValue={draft.nextStepDueDate} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Canal</span>
          <select
            name="nextStepChannel"
            defaultValue={draft.nextStepChannel}
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="">Sin canal</option>
            {NEXT_STEP_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {NEXT_STEP_CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {openTasks.length > 0 && (
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Tarea asociada</span>
          <select
            name="nextStepActivityId"
            defaultValue={currentActivityId ?? ""}
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="">Sin tarea</option>
            {openTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Motivo o contexto</span>
        <Textarea name="nextStepContext" rows={2} defaultValue={draft.nextStepContext} />
      </label>
    </>
  );
}

export function NextActionCard({
  entity,
  entityId,
  value,
  ownerLabel,
  suggestions,
  openTasks,
  closed = false,
}: {
  entity: NextActionEntity;
  entityId: string;
  value: NextActionValue;
  ownerLabel: string;
  suggestions: NextActionSuggestion[];
  openTasks: { id: string; title: string }[];
  closed?: boolean;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "complete">("view");
  const [draft, setDraft] = useState<Draft>({
    nextStep: value.nextStep ?? "",
    nextStepDueDate: value.nextStepDueDate?.slice(0, 10) ?? "",
    nextStepChannel: value.nextStepChannel ?? "",
    nextStepContext: value.nextStepContext ?? "",
  });
  const [formKey, setFormKey] = useState(0);
  const [aiPending, startAi] = useTransition();
  const [aiSuggestion, setAiSuggestion] = useState<NextActionSuggestion | null>(null);

  function onDone(result: NextActionFormState) {
    if (result && "success" in result) {
      toast.success(result.message);
      setMode("view");
    }
    return result;
  }
  const [saveState, saveAction] = useActionState<NextActionFormState, FormData>(
    async (prev, formData) => onDone(await saveNextAction(entity, entityId, prev, formData)),
    undefined,
  );
  const [completeState, completeAction] = useActionState<NextActionFormState, FormData>(
    async (prev, formData) => onDone(await completeNextAction(entity, entityId, prev, formData)),
    undefined,
  );

  const state = nextActionState(
    value.nextStep,
    value.nextStepDueDate ? new Date(value.nextStepDueDate) : null,
  );
  const badge = STATE_BADGE[state];

  function applySuggestion(suggestion: NextActionSuggestion) {
    setDraft({
      nextStep: suggestion.title,
      nextStepDueDate: suggestion.suggestedDueDate?.toISOString().slice(0, 10) ?? "",
      nextStepChannel: suggestion.channel ?? "",
      nextStepContext: suggestion.reason,
    });
    setFormKey((key) => key + 1);
    setMode("edit");
  }

  function requestAi() {
    startAi(async () => {
      const result = await suggestNextActionAI(entity, entityId);
      if (!result || "error" in result) {
        toast.error(result?.error ?? "No se pudo obtener la sugerencia.");
        return;
      }
      const due = dayOffset(result.suggestion.dueInDays);
      setAiSuggestion({
        code: "ai",
        title: result.suggestion.action,
        channel: result.suggestion.channel,
        reason: result.suggestion.reason,
        severity: "info",
        suggestedDueDate: due ? new Date(due) : null,
      });
    });
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Próxima mejor acción</CardTitle>
        <div className="flex flex-wrap gap-2">
          {mode === "view" && (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={() => setMode("edit")}>
                {value.nextStep ? "Editar" : "Definir"}
              </Button>
              {value.nextStep && (
                <Button type="button" size="sm" onClick={() => setMode("complete")}>
                  Completar
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" disabled={aiPending} onClick={requestAi}>
                <SparklesIcon />
                {aiPending ? "Pensando..." : "Sugerir con IA"}
              </Button>
            </>
          )}
          {mode !== "view" && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
              Cancelar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "view" && (
          <div className="space-y-2">
            {value.nextStep ? (
              <p className="text-base font-medium">{value.nextStep}</p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {closed
                  ? "Registro cerrado: sin próxima acción requerida."
                  : "No hay una próxima acción confirmada."}
              </p>
            )}
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {!closed && <Badge variant={badge.variant}>{badge.label}</Badge>}
              {value.nextStepChannel && <span>Canal: {nextStepChannelLabel(value.nextStepChannel)}</span>}
              <span>Responsable: {ownerLabel}</span>
              {value.nextStepDueDate && (
                <span>Fecha: {new Date(value.nextStepDueDate).toISOString().slice(0, 10)}</span>
              )}
              {value.nextStepActivityId && <span>Con tarea asociada</span>}
            </div>
            {value.nextStepContext && (
              <p className="text-sm">
                <span className="text-muted-foreground">Motivo: </span>
                {value.nextStepContext}
              </p>
            )}
          </div>
        )}

        {mode === "edit" && (
          <form key={formKey} action={saveAction} className="space-y-3">
            <NextActionFields draft={draft} openTasks={openTasks} currentActivityId={value.nextStepActivityId} />
            {saveState && "error" in saveState && (
              <p className="text-destructive text-xs">{saveState.error}</p>
            )}
            <SubmitButton pendingText="Guardando...">Guardar próxima acción</SubmitButton>
          </form>
        )}

        {mode === "complete" && (
          <form action={completeAction} className="space-y-3">
            <p className="text-sm">
              Completar: <span className="font-medium">{value.nextStep}</span>
            </p>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Resultado</span>
              <Textarea name="outcome" rows={2} required placeholder="¿Qué pasó?" />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Registrar como interacción</span>
              <select
                name="interactionType"
                defaultValue={
                  value.nextStepChannel && isInteractionType(value.nextStepChannel)
                    ? value.nextStepChannel
                    : ""
                }
                className="bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">No registrar (fue trabajo interno)</option>
                {INTERACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ACTIVITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-muted-foreground pt-2 text-xs font-medium">Nueva próxima acción (opcional)</p>
            <NextActionFields
              draft={{ nextStep: "", nextStepDueDate: "", nextStepChannel: "", nextStepContext: "" }}
              openTasks={openTasks}
              currentActivityId={null}
            />
            {completeState && "error" in completeState && (
              <p className="text-destructive text-xs">{completeState.error}</p>
            )}
            <SubmitButton pendingText="Guardando...">Completar acción</SubmitButton>
          </form>
        )}

        {mode === "view" && (suggestions.length > 0 || aiSuggestion) && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-muted-foreground text-xs font-medium">Sugerencias (no confirmadas)</p>
            {[...(aiSuggestion ? [aiSuggestion] : []), ...suggestions].map((suggestion, index) => (
              <div
                key={`${suggestion.code}-${index}`}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-dashed p-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {suggestion.code === "ai" ? (
                      <Badge variant="outline">
                        <SparklesIcon /> Sugerencia IA
                      </Badge>
                    ) : (
                      <Badge variant={suggestion.severity === "critical" ? "destructive" : "outline"}>
                        Regla
                      </Badge>
                    )}
                    <span className="text-sm">{suggestion.title}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {suggestion.reason}
                    {suggestion.channel ? ` · ${nextStepChannelLabel(suggestion.channel)}` : ""}
                  </p>
                </div>
                {!closed && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => applySuggestion(suggestion)}>
                    Usar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
