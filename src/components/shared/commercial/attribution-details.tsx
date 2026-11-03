import Link from "next/link";
import {
  sourceChannelLabel,
  type AttributionSummary,
} from "@/lib/commercial/attribution";

const METHOD_LABELS: Record<string, string> = {
  manual: "registrada manualmente",
  inbound: "recibida desde la web",
  agent: "registrada por el agente",
  migration: "migrada del campo origen",
};

// Resumen de un toque de atribución: canal, campaña, referidor y UTM. Solo
// muestra lo que existe; nunca completa datos ausentes.
export function AttributionDetails({
  attribution,
}: {
  attribution: AttributionSummary | null;
}) {
  if (!attribution) {
    return <p className="text-muted-foreground text-sm">Sin origen registrado</p>;
  }
  const utm = [
    attribution.utmSource && `source=${attribution.utmSource}`,
    attribution.utmMedium && `medium=${attribution.utmMedium}`,
    attribution.utmCampaign && `campaign=${attribution.utmCampaign}`,
    attribution.utmContent && `content=${attribution.utmContent}`,
  ].filter(Boolean);
  return (
    <dl className="grid gap-1 text-sm">
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-muted-foreground">Canal</dt>
        <dd className="font-medium">{sourceChannelLabel(attribution.sourceChannel)}</dd>
      </div>
      {attribution.campaign && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Campaña</dt>
          <dd>{attribution.campaign.name}</dd>
        </div>
      )}
      {attribution.referrerPerson && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Referido por</dt>
          <dd>
            <Link
              href={`/people/${attribution.referrerPerson.id}`}
              className="text-primary hover:underline"
            >
              {attribution.referrerPerson.firstName} {attribution.referrerPerson.lastName}
            </Link>
          </dd>
        </div>
      )}
      {attribution.referrerPartner && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Partner</dt>
          <dd>
            <Link
              href={`/partners/${attribution.referrerPartner.id}`}
              className="text-primary hover:underline"
            >
              {attribution.referrerPartner.displayName}
            </Link>
          </dd>
        </div>
      )}
      {utm.length > 0 && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">UTM</dt>
          <dd className="break-all">{utm.join(" · ")}</dd>
        </div>
      )}
      {attribution.landingPage && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Landing</dt>
          <dd className="break-all">{attribution.landingPage}</dd>
        </div>
      )}
      {attribution.sourceDetail && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Detalle</dt>
          <dd>{attribution.sourceDetail}</dd>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        {METHOD_LABELS[attribution.method] ?? attribution.method}
        {attribution.touchedAt
          ? ` · primer toque ${attribution.touchedAt.toISOString().slice(0, 10)}`
          : ""}
      </p>
    </dl>
  );
}
