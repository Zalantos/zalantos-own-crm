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
import { SubmitButton } from "@/components/shared/submit-button";
import {
  ALERT_CONDITIONS,
  ALERT_CONDITION_LABELS,
  ALERT_DAY_TYPES,
  ALERT_DAY_TYPE_LABELS,
  ALERT_PIPELINES,
  ALERT_PIPELINE_LABELS,
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LABELS,
  PAUSED_STAGE_KEY,
  type AlertPipeline,
} from "@/lib/commercial/alerts";
import { createAlertRule, updateAlertRule, type RuleFormState } from "./actions";

const selectClass = "bg-background h-9 w-full rounded-md border px-2 text-sm";

type Option = { id: string; label: string };

export type RuleValues = {
  id: string;
  pipeline: string;
  stageKey: string;
  condition: string;
  thresholdDays: number;
  dayType: string;
  severity: string;
  recipientType: string;
  recipientUserId: string | null;
};

export function RuleDialog({
  rule,
  stages,
  users,
}: {
  rule?: RuleValues;
  stages: Record<AlertPipeline, Option[]>;
  users: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [pipeline, setPipeline] = useState<AlertPipeline>(
    rule?.pipeline === "prospecting" ? "prospecting" : "opportunity",
  );
  const [stageKey, setStageKey] = useState(rule?.stageKey ?? "");
  const action = rule ? updateAlertRule.bind(null, rule.id) : createAlertRule;
  const [state, formAction] = useActionState<RuleFormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result && "ok" in result) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, undefined);
  const paused = stageKey === PAUSED_STAGE_KEY;
  const conditions = paused
    ? (["reactivation_due"] as const)
    : ALERT_CONDITIONS.filter((condition) => condition !== "reactivation_due");

  return (
    <>
      <Button type="button" size="sm" variant={rule ? "ghost" : "default"} onClick={() => setOpen(true)}>
        {rule ? "Editar" : "Nueva regla"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{rule ? "Editar regla" : "Nueva regla"}</DialogTitle>
            <DialogDescription>
              Se evalúa sobre las fechas reales de cada registro. Ganadas y perdidas nunca generan alertas.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Proceso</span>
              <select
                name="pipeline"
                value={pipeline}
                onChange={(event) => {
                  setPipeline(event.target.value as AlertPipeline);
                  setStageKey("");
                }}
                className={selectClass}
              >
                {ALERT_PIPELINES.map((value) => (
                  <option key={value} value={value}>
                    {ALERT_PIPELINE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Etapa</span>
              <select
                name="stageKey"
                required
                value={stageKey}
                onChange={(event) => setStageKey(event.target.value)}
                className={selectClass}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {stages[pipeline].map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="text-muted-foreground">Condición</span>
              <select name="condition" defaultValue={rule?.condition ?? conditions[0]} key={String(paused)} className={selectClass}>
                {conditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {ALERT_CONDITION_LABELS[condition]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Cantidad de días</span>
              <Input name="thresholdDays" type="number" min={0} max={365} defaultValue={rule?.thresholdDays ?? 7} required />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Tipo de días</span>
              <select name="dayType" defaultValue={rule?.dayType ?? "calendar"} className={selectClass}>
                {ALERT_DAY_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {ALERT_DAY_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Severidad</span>
              <select name="severity" defaultValue={rule?.severity ?? "warning"} className={selectClass}>
                {ALERT_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {ALERT_SEVERITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Destinatario</span>
              <select
                name="recipient"
                defaultValue={rule?.recipientType === "user" ? (rule.recipientUserId ?? "owner") : "owner"}
                className={selectClass}
              >
                <option value="owner">Responsable del registro</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
            {state && "error" in state && (
              <p className="text-destructive text-xs sm:col-span-2">{state.error}</p>
            )}
            <DialogFooter className="sm:col-span-2">
              <SubmitButton pendingText="Guardando...">Guardar regla</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
