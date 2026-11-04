import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpportunityStatusBadge } from "@/components/shared/opportunities/status-badge";
import { actorRoleLabel, actorKey, type ActorRef } from "@/lib/commercial/actors";
import { leadStatusLabel } from "@/lib/commercial/leads";
import { loadActorParticipation } from "@/lib/commercial/actor-service";

type Participation = Awaited<ReturnType<typeof loadActorParticipation>>;

// Prospectos y oportunidades en los que participa un actor.
export function ActorParticipationCards({
  actor,
  participation,
}: {
  actor: ActorRef;
  participation: Participation;
}) {
  const filter = encodeURIComponent(actorKey(actor));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card size="sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Prospectos y leads ({participation.leads.length})</CardTitle>
          <Link href={`/prospecting?view=list&actor=${filter}`} className="text-primary text-xs hover:underline">
            Ver en lista
          </Link>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {participation.leads.length === 0 ? (
            <p className="text-muted-foreground">Sin prospectos vinculados.</p>
          ) : (
            participation.leads.map((lead) => (
              <Link key={lead.id} href={`/prospecting/${lead.id}`} className="flex items-center justify-between gap-2 hover:underline">
                <span className="truncate">{lead.title}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline">{actorRoleLabel(lead.role)}</Badge>
                  <span className="text-muted-foreground text-xs">{leadStatusLabel(lead.status)}</span>
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Oportunidades ({participation.opportunities.length})</CardTitle>
          <Link href={`/opportunities/list?actor=${filter}`} className="text-primary text-xs hover:underline">
            Ver en lista
          </Link>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {participation.opportunities.length === 0 ? (
            <p className="text-muted-foreground">Sin oportunidades vinculadas.</p>
          ) : (
            participation.opportunities.map((opportunity) => (
              <Link key={opportunity.id} href={`/opportunities/${opportunity.id}`} className="flex items-center justify-between gap-2 hover:underline">
                <span className="truncate">
                  {opportunity.name} · {opportunity.company.name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline">{actorRoleLabel(opportunity.role)}</Badge>
                  <OpportunityStatusBadge status={opportunity.status} />
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
