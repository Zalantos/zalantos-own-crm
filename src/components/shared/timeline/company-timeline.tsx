import { getCompanyTimeline } from "@/lib/timeline";
import { formatDateTime } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  meeting_created: "Reunión",
  proposal_applied: "Cambios aplicados",
  note_added: "Nota",
  stage_changed: "Cambio de etapa",
  task_created: "Tarea",
};

export async function CompanyTimeline({ companyId }: { companyId: string }) {
  const events = await getCompanyTimeline(companyId);

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
            {formatDateTime(event.occurredAt)}
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
