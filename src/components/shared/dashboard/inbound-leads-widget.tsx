import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type NewLeadPreview = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  createdAt: Date;
};

export function InboundLeadsWidget({
  newCount,
  recentLeads,
}: {
  newCount: number;
  recentLeads: NewLeadPreview[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Leads entrantes</CardTitle>
        {newCount > 0 && <Badge variant="warning">{newCount} nuevos</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        {recentLeads.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay leads nuevos</p>
        ) : (
          <div className="space-y-2">
            {recentLeads.map((lead) => {
              const fullName = [lead.firstName, lead.lastName]
                .filter(Boolean)
                .join(" ");
              return (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="hover:bg-muted/50 block rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  <p className="font-medium">{fullName || "Sin nombre"}</p>
                  <p className="text-muted-foreground text-xs">
                    {lead.company ?? "Sin empresa"} ·{" "}
                    {formatDistanceToNow(lead.createdAt, {
                      addSuffix: true,
                      locale: es,
                    })}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
        <Link
          href="/leads"
          className="text-muted-foreground block text-sm hover:underline"
        >
          Ver bandeja
        </Link>
      </CardContent>
    </Card>
  );
}
