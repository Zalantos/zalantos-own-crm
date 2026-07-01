"use client";

import { useTransition } from "react";
import { updateOpportunityStage } from "@/app/(dashboard)/opportunities/actions";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
} from "@/lib/zod/opportunity";
import type { OpportunityStage } from "@prisma/client";

export function StageSelect({
  opportunityId,
  currentStage,
}: {
  opportunityId: string;
  currentStage: OpportunityStage;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={currentStage}
      disabled={isPending}
      onChange={(event) => {
        const stage = event.target.value;
        startTransition(() => {
          void updateOpportunityStage(opportunityId, stage);
        });
      }}
      className="bg-background h-9 rounded-md border px-3 text-sm disabled:opacity-50"
    >
      {OPPORTUNITY_STAGES.map((stage) => (
        <option key={stage} value={stage}>
          {OPPORTUNITY_STAGE_LABELS[stage]}
        </option>
      ))}
    </select>
  );
}
