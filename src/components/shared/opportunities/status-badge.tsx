import type { OpportunityStage } from "@prisma/client";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/zod/opportunity";

const OPPORTUNITY_STATUS_CONFIG: Record<
  string,
  { label: string; variant: VariantProps<typeof badgeVariants>["variant"] }
> = {
  open: { label: "Abierta", variant: "default" },
  won: { label: "Ganada", variant: "success" },
  lost: { label: "Perdida", variant: "destructive" },
};

export function OpportunityStatusBadge({ status }: { status: string }) {
  const config = OPPORTUNITY_STATUS_CONFIG[status] ?? {
    label: status,
    variant: "outline" as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function OpportunityStageBadge({ stage }: { stage: OpportunityStage }) {
  const isWon = stage === "ganado";
  const isLost = stage === "perdido";

  return (
    <Badge variant={isWon ? "success" : isLost ? "destructive" : "outline"}>
      {OPPORTUNITY_STAGE_LABELS[stage]}
    </Badge>
  );
}
