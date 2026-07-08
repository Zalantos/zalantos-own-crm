import {
  Building2Icon,
  CircleDollarSignIcon,
  ClockAlertIcon,
  TargetIcon,
  VideoIcon,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { formatCurrencyValue } from "@/lib/format";

export function StatRow({
  companyCount,
  openOpportunityCount,
  pipelineValue,
  overdueActivityCount,
  meetingsReadyCount,
  meetingsTotalCount,
  currency,
  locale,
}: {
  companyCount: number;
  openOpportunityCount: number;
  pipelineValue: number;
  overdueActivityCount: number;
  meetingsReadyCount: number;
  meetingsTotalCount: number;
  currency: string;
  locale: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Empresas" value={companyCount} icon={Building2Icon} />
      <StatCard
        label="Oportunidades abiertas"
        value={openOpportunityCount}
        icon={TargetIcon}
      />
      <StatCard
        label="Valor de pipeline"
        value={formatCurrencyValue(pipelineValue, currency, locale)}
        icon={CircleDollarSignIcon}
      />
      <StatCard
        label="Actividades vencidas"
        value={overdueActivityCount}
        icon={ClockAlertIcon}
        valueClassName={
          overdueActivityCount > 0 ? "text-destructive" : undefined
        }
      />
      <StatCard
        label="Meetings procesados"
        value={`${meetingsReadyCount}/${meetingsTotalCount}`}
        icon={VideoIcon}
      />
    </div>
  );
}
