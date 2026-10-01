import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import { INBOUND_LEAD_STATUS_LABELS } from "@/lib/inbound-leads/status";

const LEAD_STATUS_VARIANT: Record<
  string,
  VariantProps<typeof badgeVariants>["variant"]
> = {
  new: "warning",
  reviewed: "secondary",
  converted: "success",
  rejected: "outline",
};

export function LeadStatusBadge({ status }: { status: string }) {
  const label =
    INBOUND_LEAD_STATUS_LABELS[status as keyof typeof INBOUND_LEAD_STATUS_LABELS] ??
    status;
  const variant = LEAD_STATUS_VARIANT[status] ?? "outline";
  return <Badge variant={variant}>{label}</Badge>;
}
