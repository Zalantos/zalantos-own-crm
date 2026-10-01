import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadRow } from "@/components/shared/leads/lead-row";
import { isInboundLeadStatus } from "@/lib/inbound-leads/status";

type SearchParams = { status?: string };

function buildQuery(status: string) {
  return status === "all" ? "/leads" : `/leads?status=${status}`;
}

const TABS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: "Nuevos" },
  { value: "reviewed", label: "Revisados" },
  { value: "converted", label: "Convertidos" },
  { value: "rejected", label: "Descartados" },
];

export default async function InboundLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { status: rawStatus } = await searchParams;
  const status =
    rawStatus && isInboundLeadStatus(rawStatus) ? rawStatus : "all";
  const { db } = await requireOrgContext();

  const [leads, newCount] = await Promise.all([
    db.inboundLead.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
        message: true,
        source: true,
        status: true,
        createdAt: true,
      },
    }),
    db.inboundLead.count({ where: { status: "new" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Leads entrantes"
        description={
          newCount > 0
            ? `${newCount} lead${newCount === 1 ? "" : "s"} nuevo${newCount === 1 ? "" : "s"} esperando revisión`
            : "Bandeja de leads recibidos desde canales externos"
        }
      />

      <Tabs defaultValue={status}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              nativeButton={false}
              render={<Link href={buildQuery(tab.value)} />}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={status} className="max-w-2xl space-y-2 pt-4">
          {leads.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay leads en este filtro.
            </p>
          ) : (
            leads.map((lead) => <LeadRow key={lead.id} lead={lead} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
