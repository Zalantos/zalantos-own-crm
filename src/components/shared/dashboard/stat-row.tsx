import {
  Building2Icon,
  CircleDollarSignIcon,
  ClockAlertIcon,
  TargetIcon,
  UsersRoundIcon,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { formatCurrencyValue } from "@/lib/format";

export function StatRow({
  companyCount,
  openOpportunityCount,
  pipelineValue,
  overdueActivityCount,
  meetingsLast30Days,
  currency,
  locale,
}: {
  companyCount: number;
  openOpportunityCount: number;
  pipelineValue: number;
  overdueActivityCount: number;
  meetingsLast30Days: number;
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
        label="Reuniones (30 días)"
        value={meetingsLast30Days}
        icon={UsersRoundIcon}
      />
    </div>
  );
}
