import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { loadPendingAlerts } from "@/lib/commercial/alert-service";

type Pending = Awaited<ReturnType<typeof loadPendingAlerts>>;

function targetOf(alert: Pending["alerts"][number]) {
  if (alert.opportunity) {
    return { href: `/opportunities/${alert.opportunity.id}`, label: alert.opportunity.name };
  }
  if (alert.commercialLead) {
    return { href: `/prospecting/${alert.commercialLead.id}`, label: alert.commercialLead.title };
  }
  return null;
}

export function CommercialAlertsWidget({
  alerts,
  total,
  userId,
}: Pending & { userId: string }) {
  if (total === 0) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Alertas comerciales ({total})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {alerts.map((alert) => {
          const target = targetOf(alert);
          if (!target) return null;
          return (
            <Link key={alert.id} href={target.href} className="hover:bg-muted flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{target.label}</span>
                <span className="text-muted-foreground block truncate text-xs">{alert.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {alert.recipientUserId === userId && <Badge variant="outline">Tuya</Badge>}
                <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                  {alert.severity === "critical" ? "Crítica" : alert.severity === "warning" ? "Advertencia" : "Info"}
                </Badge>
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
