"use client";

import {
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type PipelineStageDatum = {
  stage: string;
  label: string;
  // Oportunidades actualmente en esta etapa
  count: number;
  // Oportunidades en esta etapa o en etapas posteriores (forma del embudo)
  cumulative: number;
  fill: string;
};

type FunnelTooltipPayload = {
  label: string;
  count: number;
  cumulative: number;
};

export function PipelineChart({ data }: { data: PipelineStageDatum[] }) {
  const funnelData = data.filter((item) => item.cumulative > 0);

  if (funnelData.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No hay oportunidades abiertas todavía.
      </p>
    );
  }

  const topOfFunnel = funnelData[0]?.cumulative ?? 0;
  const chartHeight = Math.max(320, funnelData.length * 40);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <FunnelChart margin={{ top: 8, right: 140, bottom: 8, left: 8 }}>
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            color: "var(--color-popover-foreground)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
          // Recharts tipa el formatter de forma genérica; el payload trae nuestros campos.
          formatter={(value, _name, item) => {
            const payload = (
              item as { payload?: FunnelTooltipPayload } | undefined
            )?.payload;
            const cumulative = Number(value);
            const retention =
              topOfFunnel > 0
                ? Math.round((cumulative / topOfFunnel) * 100)
                : 0;
            const inStage = payload?.count ?? 0;
            return [
              `${cumulative} en o después · ${inStage} en la etapa · ${retention}% del embudo`,
              "Oportunidades",
            ];
          }}
          labelFormatter={(_label, payload) => {
            const first = payload?.[0] as
              | { payload?: FunnelTooltipPayload }
              | undefined;
            return first?.payload?.label ?? "";
          }}
        />
        <Funnel
          dataKey="cumulative"
          data={funnelData}
          nameKey="label"
          isAnimationActive
          lastShapeType="rectangle"
          stroke="var(--color-background)"
        >
          <LabelList
            position="right"
            fill="var(--color-foreground)"
            stroke="none"
            dataKey="label"
            style={{ fontSize: 12 }}
          />
          <LabelList
            position="inside"
            fill="var(--color-primary-foreground)"
            stroke="none"
            dataKey="cumulative"
            style={{ fontSize: 12, fontWeight: 600 }}
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
