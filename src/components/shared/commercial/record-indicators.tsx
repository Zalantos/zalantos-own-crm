import { BellIcon, UsersRoundIcon } from "lucide-react";
import { highestSeverity } from "@/lib/commercial/alerts";

const SEVERITY_CLASS: Record<string, string> = {
  critical: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-muted-foreground",
};

// Indicadores compactos para tarjetas y listas: el detalle vive en la ficha.
export function ActorIndicator({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <span
      title={labels.join("\n")}
      aria-label={`Actores: ${labels.join(", ")}`}
      className="text-muted-foreground inline-flex items-center gap-1 text-xs"
    >
      <UsersRoundIcon className="size-3" />
      {labels.length}
    </span>
  );
}

export function AlertIndicator({ alerts }: { alerts: { severity: string; title: string }[] }) {
  if (alerts.length === 0) return null;
  const severity = highestSeverity(alerts.map((alert) => alert.severity)) ?? "info";
  const titles = alerts.map((alert) => alert.title);
  return (
    <span
      title={titles.join("\n")}
      aria-label={`Alertas: ${titles.join(", ")}`}
      className={`inline-flex items-center gap-1 text-xs font-medium ${SEVERITY_CLASS[severity]}`}
    >
      <BellIcon className="size-3" />
      {alerts.length}
    </span>
  );
}
