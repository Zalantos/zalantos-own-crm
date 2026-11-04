import { Trash2Icon } from "lucide-react";
import { requireOrgAdminContext } from "@/lib/tenant";
import { getActiveOrgUsers } from "@/lib/team";
import { getOrgStages, boardStages } from "@/lib/pipeline/stages";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ALERT_DAY_TYPE_LABELS,
  ALERT_PIPELINES,
  ALERT_PIPELINE_LABELS,
  ALERT_SEVERITY_LABELS,
  PAUSED_STAGE_KEY,
  alertConditionLabel,
  isAlertSeverity,
  type AlertDayType,
  type AlertPipeline,
} from "@/lib/commercial/alerts";
import { ACTIVE_LEAD_STATUSES, leadStatusLabel } from "@/lib/commercial/leads";
import { deleteAlertRule, toggleAlertRule } from "./actions";
import { RuleDialog } from "./rule-form";

export default async function AlertRulesPage() {
  const { db } = await requireOrgAdminContext();
  const [rules, stages, users] = await Promise.all([
    db.commercialAlertRule.findMany({
      orderBy: [{ pipeline: "asc" }, { stageKey: "asc" }, { condition: "asc" }],
      include: { recipientUser: { select: { name: true, email: true } } },
    }),
    getOrgStages(db),
    getActiveOrgUsers(db),
  ]);
  const stageOptions: Record<AlertPipeline, { id: string; label: string }[]> = {
    prospecting: ACTIVE_LEAD_STATUSES.map((status) => ({ id: status, label: leadStatusLabel(status) })),
    opportunity: [
      ...boardStages(stages).map((stage) => ({ id: stage.key, label: stage.label })),
      { id: PAUSED_STAGE_KEY, label: "Pausada" },
    ],
  };
  const userOptions = users.map((user) => ({ id: user.id, label: user.name ?? user.email }));
  const stageLabel = (pipeline: AlertPipeline, key: string) =>
    stageOptions[pipeline].find((stage) => stage.id === key)?.label ?? `${key} (retirada)`;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Alertas por etapa"
        description="Reglas de seguimiento de prospección y oportunidades. Se evalúan con el cron comercial y al abrir cada ficha."
        actions={<RuleDialog stages={stageOptions} users={userOptions} />}
      />
      {ALERT_PIPELINES.map((pipeline) => {
        const pipelineRules = rules.filter((rule) => rule.pipeline === pipeline);
        return (
          <section key={pipeline} className="mb-8 max-w-4xl">
            <h2 className="mb-2 text-sm font-semibold">{ALERT_PIPELINE_LABELS[pipeline]}</h2>
            <div className="space-y-2">
              {pipelineRules.length === 0 && (
                <p className="text-muted-foreground text-sm">Sin reglas configuradas.</p>
              )}
              {pipelineRules.map((rule) => (
                <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {stageLabel(pipeline, rule.stageKey)} · {alertConditionLabel(rule.condition)}
                      {!rule.isActive && <Badge variant="outline">Desactivada</Badge>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {rule.condition === "reactivation_due"
                        ? "Al llegar la fecha"
                        : `${rule.thresholdDays} días ${ALERT_DAY_TYPE_LABELS[rule.dayType as AlertDayType]?.toLowerCase() ?? rule.dayType}`}
                      {" · "}
                      {isAlertSeverity(rule.severity) ? ALERT_SEVERITY_LABELS[rule.severity] : rule.severity}
                      {" · "}
                      {rule.recipientUser
                        ? (rule.recipientUser.name ?? rule.recipientUser.email)
                        : "Responsable del registro"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <RuleDialog rule={rule} stages={stageOptions} users={userOptions} />
                    <form action={toggleAlertRule.bind(null, rule.id, !rule.isActive)}>
                      <Button type="submit" size="sm" variant="ghost">
                        {rule.isActive ? "Desactivar" : "Activar"}
                      </Button>
                    </form>
                    <form action={deleteAlertRule.bind(null, rule.id)}>
                      <Button type="submit" variant="ghost" size="icon">
                        <Trash2Icon className="h-4 w-4" />
                        <span className="sr-only">Eliminar regla</span>
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
