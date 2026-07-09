import {
  getCompanyTimeline,
  getOpportunityTimeline,
  TYPE_LABELS,
} from "@/lib/timeline";
import { requireOrgContext } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";
import { actorLabel } from "@/lib/traceability";

type TimelineProps =
  | { companyId: string; opportunityId?: never }
  | { opportunityId: string; companyId?: never };

export async function CompanyTimeline(props: TimelineProps) {
  const { db } = await requireOrgContext();
  const events =
    "opportunityId" in props && props.opportunityId
      ? await getOpportunityTimeline(db, props.opportunityId)
      : await getCompanyTimeline(db, (props as { companyId: string }).companyId);

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Todavía no hay eventos en la línea temporal.
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="bg-primary absolute -left-[21px] top-1.5 h-2 w-2 rounded-full" />
          <p className="text-muted-foreground text-xs">
            {TYPE_LABELS[event.type] ?? event.type} ·{" "}
            {formatDateTime(event.occurredAt)} · {actorLabel(event.actor)}
          </p>
          <p className="text-sm font-medium">{event.title}</p>
          {event.summary && (
            <p className="text-muted-foreground text-sm">{event.summary}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
