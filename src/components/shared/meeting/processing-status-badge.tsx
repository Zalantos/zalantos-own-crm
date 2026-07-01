import { Badge } from "@/components/ui/badge";
import type { ProcessingStatus } from "@prisma/client";

const CONFIG: Record<
  ProcessingStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pendiente", variant: "outline" },
  extracting: { label: "Extrayendo texto", variant: "secondary" },
  transcribing: { label: "Transcribiendo", variant: "secondary" },
  analyzing: { label: "Analizando con IA", variant: "secondary" },
  ready: { label: "Listo", variant: "default" },
  failed: { label: "Error", variant: "destructive" },
};

export function ProcessingStatusBadge({
  status,
}: {
  status: ProcessingStatus;
}) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
