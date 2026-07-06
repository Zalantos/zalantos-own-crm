import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { TYPE_LABELS } from "@/lib/timeline";
import type { getActivityFeed } from "@/lib/timeline";

type ActivityEvent = Awaited<
  ReturnType<typeof getActivityFeed>
>["events"][number];

export function RecentActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Todavía no hay actividad registrada.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        // "proposal" events point at a CRMChangeProposal id, not a meeting —
        // that's only guaranteed a real destination when it came from a
        // meeting. Route to the opportunity/company the change landed on
        // instead, since that's what the event always carries.
        const href =
          event.refType === "meeting"
            ? `/meetings/${event.refId}`
            : event.refType === "proposal"
              ? event.opportunityId
                ? `/opportunities/${event.opportunityId}`
                : `/companies/${event.companyId}`
              : undefined;
        const content = (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <Badge variant="outline" className="shrink-0">
                {TYPE_LABELS[event.type] ?? event.type}
              </Badge>
            </div>
            <p className="text-muted-foreground truncate text-xs">
              {event.company?.name ?? "—"} · {formatDateTime(event.occurredAt)}
            </p>
          </>
        );

        return href ? (
          <Link
            key={event.id}
            href={href}
            className="hover:bg-muted/50 block space-y-0.5 rounded-md border p-2.5"
          >
            {content}
          </Link>
        ) : (
          <div key={event.id} className="space-y-0.5 rounded-md border p-2.5">
            {content}
          </div>
        );
      })}
    </div>
  );
}
