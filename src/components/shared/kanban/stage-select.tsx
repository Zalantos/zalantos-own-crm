"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateOpportunityStage } from "@/app/(dashboard)/opportunities/actions";
import type { StageOption } from "@/lib/pipeline/stages";

// Cambio de etapa desde la ficha. Las compuertas de avance se validan en el
// servidor; si falta información se muestra el motivo y se revierte.
export function StageSelect({
  opportunityId,
  currentStage,
  stages,
  disabled,
}: {
  opportunityId: string;
  currentStage: { id: string; label: string; isActive: boolean };
  stages: StageOption[];
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(currentStage.id);

  return (
    <select
      value={value}
      disabled={isPending || disabled}
      onChange={(event) => {
        const stageId = event.target.value;
        const previous = value;
        setValue(stageId);
        startTransition(async () => {
          const result = await updateOpportunityStage(opportunityId, stageId);
          if (result.ok) {
            toast.success("Etapa actualizada.");
          } else {
            setValue(previous);
            toast.error(result.error);
          }
        });
      }}
      aria-label="Etapa"
      className="border-input bg-background h-8 max-w-full rounded-lg border px-2.5 text-sm disabled:opacity-50"
    >
      {!currentStage.isActive && (
        <option value={currentStage.id}>{currentStage.label} (retirada)</option>
      )}
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>
          {stage.label}
        </option>
      ))}
    </select>
  );
}
