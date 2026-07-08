import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/badge";

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

export type OpportunityStageBadgeStage = {
  label: string;
  isWon: boolean;
  isLost: boolean;
};

export function OpportunityStageBadge({
  stage,
}: {
  stage: OpportunityStageBadgeStage;
}) {
  return (
    <Badge
      variant={stage.isWon ? "success" : stage.isLost ? "destructive" : "outline"}
    >
      {stage.label}
    </Badge>
  );
}
