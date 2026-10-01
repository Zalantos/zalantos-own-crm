import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { LeadStatusBadge } from "@/components/shared/leads/lead-status-badge";

export type LeadRowData = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  message: string | null;
  source: string;
  status: string;
  createdAt: Date;
};

export function LeadRow({ lead }: { lead: LeadRowData }) {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");

  return (
    <Link
      href={`/leads/${lead.id}`}
      className="hover:bg-muted/50 block space-y-1 rounded-md border p-3 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{fullName || "Sin nombre"}</p>
          {lead.company && (
            <p className="text-muted-foreground text-xs">{lead.company}</p>
          )}
          {lead.email && (
            <p className="text-muted-foreground text-xs">{lead.email}</p>
          )}
        </div>
        <LeadStatusBadge status={lead.status} />
      </div>
      {lead.message && (
        <p className="text-muted-foreground line-clamp-2 text-xs">
          &ldquo;{lead.message}&rdquo;
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {lead.source} ·{" "}
        {formatDistanceToNow(lead.createdAt, { addSuffix: true, locale: es })}
      </p>
    </Link>
  );
}
