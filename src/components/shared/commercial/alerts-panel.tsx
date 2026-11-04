"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  acknowledgeAlertAction,
  resolveAlertAction,
} from "@/app/(dashboard)/commercial/alert-actions";
import { ALERT_SEVERITY_LABELS, isAlertSeverity } from "@/lib/commercial/alerts";
import type { AlertView } from "@/lib/commercial/alert-service";

function severityVariant(severity: string): "destructive" | "outline" | "secondary" {
  if (severity === "critical") return "destructive";
  return severity === "warning" ? "secondary" : "outline";
}

function AlertRow({ alert }: { alert: AlertView }) {
  const [pending, startTransition] = useTransition();
  function run(action: (id: string) => Promise<void>, message: string) {
    startTransition(async () => {
      try {
        await action(alert.id);
        toast.success(message);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo actualizar la alerta.");
      }
    });
  }
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          {alert.title}
          <Badge variant={severityVariant(alert.severity)}>
            {isAlertSeverity(alert.severity) ? ALERT_SEVERITY_LABELS[alert.severity] : alert.severity}
          </Badge>
          {alert.status === "acknowledged" && <Badge variant="outline">Reconocida</Badge>}
        </p>
        <p className="text-muted-foreground text-xs">{alert.reason}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {alert.status === "open" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(acknowledgeAlertAction, "Alerta reconocida.")}
          >
            Reconocer
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(resolveAlertAction, "Alerta resuelta.")}
        >
          Resolver
        </Button>
      </div>
    </div>
  );
}

export function AlertsPanel({ alerts }: { alerts: AlertView[] }) {
  if (alerts.length === 0) return null;
  return (
    <Card size="sm" className="mb-4">
      <CardHeader>
        <CardTitle>Alertas de seguimiento ({alerts.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </CardContent>
    </Card>
  );
}
