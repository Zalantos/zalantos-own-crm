import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { getActiveOrgUsers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadFunnel, type BreakdownRow, type DurationStat } from "@/lib/commercial/funnel";
import { sourceChannelLabel } from "@/lib/commercial/attribution";
import { formatCurrencyValue } from "@/lib/format";

const PRESETS: Record<string, { label: string; days: number }> = {
  "30": { label: "30 días", days: 30 },
  "90": { label: "90 días", days: 90 },
  "180": { label: "6 meses", days: 180 },
  "365": { label: "12 meses", days: 365 },
};

function pct(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function days(stat: DurationStat) {
  if (stat.n === 0) return "sin datos";
  return `${stat.medianDays?.toFixed(1)} d mediana · ${stat.averageDays?.toFixed(1)} d prom. (n=${stat.n})`;
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function BreakdownTable({
  rows,
  label,
  currency,
  locale,
}: {
  rows: (BreakdownRow & { name: string })[];
  label: string;
  currency: string;
  locale: string;
}) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">Sin datos en el período.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="text-left">
            <th className="py-1 pr-3 font-medium">{label}</th>
            <th className="py-1 pr-3 font-medium">Prospectos</th>
            <th className="py-1 pr-3 font-medium">Oportunidades</th>
            <th className="py-1 pr-3 font-medium">Ganadas</th>
            <th className="py-1 pr-3 font-medium">Valor ganado</th>
            <th className="py-1 font-medium">Perdidas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t">
              <td className="py-1 pr-3">{row.name}</td>
              <td className="py-1 pr-3">{row.leads}</td>
              <td className="py-1 pr-3">{row.opportunities}</td>
              <td className="py-1 pr-3">{row.won}</td>
              <td className="py-1 pr-3">{formatCurrencyValue(row.wonValue, currency, locale)}</td>
              <td className="py-1">{row.lost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { org, db } = await requireOrgContext();
  const now = new Date();
  const preset = params.preset && PRESETS[params.preset] ? params.preset : params.from ? "custom" : "90";
  const from =
    preset === "custom" && params.from
      ? new Date(params.from)
      : new Date(now.getTime() - (PRESETS[preset]?.days ?? 90) * 86_400_000);
  const to = preset === "custom" && params.to ? new Date(`${params.to}T23:59:59.999Z`) : now;

  const [report, users, campaigns, partners] = await Promise.all([
    loadFunnel(db, { from, to }),
    getActiveOrgUsers(db),
    db.campaign.findMany({ select: { id: true, name: true } }),
    db.commercialPartner.findMany({ select: { id: true, displayName: true } }),
  ]);
  const userName = new Map(users.map((user) => [user.id, user.name ?? user.email]));
  const campaignName = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const partnerName = new Map(partners.map((partner) => [partner.id, partner.displayName]));
  const money = (value: number) => formatCurrencyValue(value, org.currency, org.locale);
  const { volume, cohort, durations, pipeline, sprint0 } = report;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Analítica comercial"
        description={`Funnel del ${from.toISOString().slice(0, 10)} al ${to.toISOString().slice(0, 10)}. No confundir con las columnas del tablero.`}
      />

      <form className="flex flex-wrap items-center gap-2">
        {Object.entries(PRESETS).map(([key, option]) => (
          <Button
            key={key}
            variant={preset === key ? "default" : "secondary"}
            size="sm"
            render={<Link href={`/analytics?preset=${key}`} />}
          >
            {option.label}
          </Button>
        ))}
        <Input name="from" type="date" defaultValue={params.from ?? ""} className="w-40" />
        <Input name="to" type="date" defaultValue={params.to ?? ""} className="w-40" />
        <Button type="submit" size="sm" variant="secondary">
          Rango
        </Button>
      </form>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Volumen del período</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="Prospectos creados" value={volume.prospectsCreated} />
          <Metric label="Contactados" value={volume.contacted} />
          <Metric label="Leads generados" value={volume.leadsGenerated} />
          <Metric label="Leads → oportunidad" value={volume.leadsConverted} />
          <Metric label="Oportunidades creadas" value={volume.opportunitiesCreated} />
          <Metric label="Calificadas" value={volume.qualified} />
          <Metric label="Propuestas enviadas" value={volume.proposalsSent} />
          <Metric label="Ganadas" value={volume.won} hint={money(volume.wonValue)} />
          <Metric label="Perdidas" value={volume.lost} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Conversión por cohorte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground text-xs">
              De los registros creados en el período, qué porcentaje alcanzó cada hito (a hoy).
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Metric label={`Prospectos (n=${cohort.leads.size}) → contactados`} value={pct(cohort.leads.contactedRate)} />
              <Metric label="→ lead" value={pct(cohort.leads.leadRate)} />
              <Metric label="→ oportunidad" value={pct(cohort.leads.convertedRate)} />
              <Metric label={`Oportunidades (n=${cohort.opportunities.size}) → calificadas`} value={pct(cohort.opportunities.qualifiedRate)} />
              <Metric label="→ propuesta enviada" value={pct(cohort.opportunities.proposalRate)} />
              <Metric label="→ ganada" value={pct(cohort.opportunities.wonRate)} hint={`Win rate cerradas: ${pct(cohort.opportunities.winRateClosed)}`} />
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Tiempo entre etapas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Prospecto → contacto: {days(durations.prospectToContact)}</p>
            <p>Contacto → lead: {days(durations.contactToLead)}</p>
            <p>Lead → oportunidad: {days(durations.leadToOpportunity)}</p>
            <p>Oportunidad → propuesta: {days(durations.opportunityToProposal)}</p>
            <p>Propuesta → ganada: {days(durations.proposalToWon)}</p>
            <p>Oportunidad → ganada: {days(durations.opportunityToWon)}</p>
            <p className="text-muted-foreground text-xs">Solo registros con ambas fechas conocidas; las fechas legacy desconocidas se excluyen.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Pipeline abierto (a hoy)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Metric label={`Abiertas (${pipeline.openCount})`} value={money(pipeline.openValue)} hint="Monto de implementación" />
            <Metric label="Ponderado por probabilidad" value={money(pipeline.weightedValue)} hint={`${pipeline.withoutProbability} sin probabilidad`} />
            <Metric label="Recurrente mensual" value={money(pipeline.openRecurringMonthly)} hint={`Año 1 estimado: ${money(pipeline.openYearOneValue)}`} />
            <Metric label="Sin próxima acción" value={pipeline.withoutNextAction} hint={`${pipeline.nextActionOverdue} con acción vencida`} />
            <Metric label="Tareas comerciales vencidas" value={pipeline.overdueCommercialTasks} />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Sprint 0</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Metric label="Agendados" value={sprint0.scheduled} />
            <Metric label="Realizados" value={sprint0.completed} />
            <Metric label="Diagnósticos entregados" value={sprint0.diagnosisDelivered} />
            <Metric label="Realizado → propuesta" value={pct(sprint0.toProposalRate)} />
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Resultados por responsable</CardTitle>
        </CardHeader>
        <CardContent>
          <BreakdownTable
            label="Responsable"
            currency={org.currency}
            locale={org.locale}
            rows={report.byOwner.map((row) => ({ ...row, name: row.key === "none" ? "Sin responsable" : (userName.get(row.key) ?? "Usuario inactivo") }))}
          />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Resultados por origen</CardTitle>
        </CardHeader>
        <CardContent>
          <BreakdownTable
            label="Canal"
            currency={org.currency}
            locale={org.locale}
            rows={report.bySource.map((row) => ({ ...row, name: row.key === "unknown" ? "Sin origen registrado" : sourceChannelLabel(row.key) }))}
          />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Por campaña</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownTable
              label="Campaña"
              currency={org.currency}
              locale={org.locale}
              rows={report.byCampaign.map((row) => ({ ...row, name: campaignName.get(row.key) ?? row.key }))}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Por partner</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownTable
              label="Partner"
              currency={org.currency}
              locale={org.locale}
              rows={report.byPartner.map((row) => ({ ...row, name: partnerName.get(row.key) ?? row.key }))}
            />
          </CardContent>
        </Card>
      </div>
      <p className="text-muted-foreground text-xs">
        Los valores son estimaciones comerciales en {org.currency}; no representan facturación ni cobros. Las ofertas en otras
        unidades (UF, USD) se consultan en cada oportunidad.
      </p>
    </div>
  );
}
