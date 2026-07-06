import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

const COMPANY_STATUS_CONFIG: Record<
  string,
  { label: string; variant: VariantProps<typeof badgeVariants>["variant"] }
> = {
  active: { label: "Activa", variant: "success" },
  inactive: { label: "Inactiva", variant: "outline" },
  churned: { label: "Perdida", variant: "destructive" },
};

export function CompanyStatusBadge({ status }: { status: string }) {
  const config = COMPANY_STATUS_CONFIG[status] ?? {
    label: status,
    variant: "outline" as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
