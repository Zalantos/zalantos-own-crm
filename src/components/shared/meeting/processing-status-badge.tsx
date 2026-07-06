import { Loader2Icon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { ProcessingStatus } from "@prisma/client";

const CONFIG: Record<
  ProcessingStatus,
  {
    label: string;
    variant: VariantProps<typeof badgeVariants>["variant"];
  }
> = {
  pending: { label: "Pendiente", variant: "outline" },
  extracting: { label: "Extrayendo texto", variant: "secondary" },
  transcribing: { label: "Transcribiendo", variant: "secondary" },
  analyzing: { label: "Analizando con IA", variant: "secondary" },
  ready: { label: "Listo", variant: "success" },
  failed: { label: "Error", variant: "destructive" },
};

const ACTIVE_STATUSES: ProcessingStatus[] = [
  "pending",
  "extracting",
  "transcribing",
  "analyzing",
];

export function ProcessingStatusBadge({
  status,
}: {
  status: ProcessingStatus;
}) {
  const { label, variant } = CONFIG[status];
  const isActive = ACTIVE_STATUSES.includes(status);

  return (
    <Badge variant={variant}>
      {isActive && <Loader2Icon className="animate-spin" />}
      {label}
    </Badge>
  );
}
