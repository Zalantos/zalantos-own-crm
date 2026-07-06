import {
  Building2Icon,
  CircleDollarSignIcon,
  ClockAlertIcon,
  TargetIcon,
  VideoIcon,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { formatCurrency } from "@/lib/currency";

export function StatRow({
  companyCount,
  openOpportunityCount,
  pipelineValue,
  overdueActivityCount,
  meetingsReadyCount,
  meetingsTotalCount,
}: {
  companyCount: number;
  openOpportunityCount: number;
  pipelineValue: number;
  overdueActivityCount: number;
  meetingsReadyCount: number;
  meetingsTotalCount: number;
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
        value={formatCurrency(pipelineValue)}
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
