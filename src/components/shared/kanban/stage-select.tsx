"use client";

import { useTransition } from "react";
import { updateOpportunityStage } from "@/app/(dashboard)/opportunities/actions";
import type { StageOption } from "@/lib/pipeline/stages";

export function StageSelect({
  opportunityId,
  currentStageId,
  stages,
}: {
  opportunityId: string;
  currentStageId: string;
  stages: StageOption[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={currentStageId}
      disabled={isPending}
      onChange={(event) => {
        const stageId = event.target.value;
        startTransition(() => {
          void updateOpportunityStage(opportunityId, stageId);
        });
      }}
      className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm disabled:opacity-50"
    >
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>
          {stage.label}
        </option>
      ))}
    </select>
  );
}
