import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { getActiveOrgUsers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/shared/data-table";
import {
  ACTIVE_LEAD_STATUSES,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  isLeadStatus,
  leadStatusLabel,
} from "@/lib/commercial/leads";
import {
  SOURCE_CHANNELS,
  SOURCE_CHANNEL_LABELS,
  isSourceChannel,
  sourceChannelLabel,
} from "@/lib/commercial/attribution";
import { nextActionState } from "@/lib/commercial/next-action";
import { actorLabel } from "@/lib/traceability";

type SearchParams = {
  view?: string;
  status?: string;
  ownerId?: string;
  channel?: string;
  campaignId?: string;
  q?: string;
  overdue?: string;
};

const selectClass = "bg-background h-9 rounded-md border px-2 text-sm";

const leadSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  nextStep: true,
  nextStepDueDate: true,
  identifiedAt: true,
  lastInteractionAt: true,
  company: { select: { id: true, name: true } },
  person: { select: { id: true, firstName: true, lastName: true } },
  owner: { select: { name: true, email: true } },
  firstTouchAttribution: {
    select: { sourceChannel: true, campaign: { select: { name: true } } },
  },
  _count: { select: { opportunities: true } },
} satisfies Prisma.CommercialLeadSelect;

type LeadRow = Prisma.CommercialLeadGetPayload<{ select: typeof leadSelect }>;

function buildQuery(params: SearchParams, overrides: Partial<SearchParams>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `/prospecting?${text}` : "/prospecting";
}

function NextActionText({ lead }: { lead: LeadRow }) {
  const state = nextActionState(lead.nextStep, lead.nextStepDueDate);
  if (state === "missing") return <span className="text-muted-foreground">Sin próxima acción</span>;
  return (
    <span className={state === "overdue" ? "text-destructive" : undefined}>
      {lead.nextStepDueDate ? `${lead.nextStepDueDate.toISOString().slice(0, 10)} · ` : ""}
      {lead.nextStep}
    </span>
  );
}

function LeadCard({ lead }: { lead: LeadRow }) {
  const contact = lead.person ? `${lead.person.firstName} ${lead.person.lastName}` : null;
  return (
    <Link
      href={`/prospecting/${lead.id}`}
      className="ring-foreground/10 bg-card block space-y-1 rounded-lg p-2.5 text-sm shadow-sm ring-1 hover:shadow-md"
    >
      <p className="line-clamp-2 font-medium">{lead.title}</p>
      <p className="text-muted-foreground truncate text-xs">
        {[lead.company?.name, contact].filter(Boolean).join(" · ")}
      </p>
      <div className="flex flex-wrap gap-1">
        {lead.firstTouchAttribution && (
          <Badge variant="outline">{sourceChannelLabel(lead.firstTouchAttribution.sourceChannel)}</Badge>
        )}
        {lead.priority === "high" && <Badge variant="destructive">Prioridad alta</Badge>}
      </div>
      <p className="line-clamp-2 text-xs">
        <NextActionText lead={lead} />
      </p>
    </Link>
  );
}

export default async function ProspectingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "board";
  const { db, user } = await requireOrgContext();
  const search = params.q?.trim();
  const now = new Date();

  const where: Prisma.CommercialLeadWhereInput = {
    ...(params.status && isLeadStatus(params.status)
      ? { status: params.status }
      : view === "board"
        ? { status: { in: ACTIVE_LEAD_STATUSES } }
        : {}),
    ...(params.ownerId === "me"
      ? { ownerId: user.id }
      : params.ownerId === "none"
        ? { ownerId: null }
        : params.ownerId
          ? { ownerId: params.ownerId }
          : {}),
    ...(params.channel || params.campaignId
      ? {
          firstTouchAttribution: {
            ...(params.channel && isSourceChannel(params.channel)
              ? { sourceChannel: params.channel }
              : {}),
            ...(params.campaignId ? { campaignId: params.campaignId } : {}),
          },
        }
      : {}),
    ...(params.overdue === "1" ? { nextStepDueDate: { lt: now } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
            { person: { firstName: { contains: search, mode: "insensitive" } } },
            { person: { lastName: { contains: search, mode: "insensitive" } } },
            { person: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [leads, users, campaigns, counts] = await Promise.all([
    db.commercialLead.findMany({
      where,
      select: leadSelect,
      orderBy: [{ nextStepDueDate: { sort: "asc", nulls: "last" } }, { identifiedAt: "desc" }],
      take: 500,
    }),
    getActiveOrgUsers(db),
    db.campaign.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.commercialLead.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countByStatus = new Map(counts.map((row) => [row.status, row._count._all]));

  return (
    <div className="min-w-0">
      <PageHeader
        title="Prospección"
        description="Prospecto → contactado → lead. Sin oportunidad hasta que exista un proyecto concreto."
        actions={
          <>
            <Button
              variant="secondary"
              render={<Link href={buildQuery(params, { view: view === "board" ? "list" : undefined })} />}
            >
              {view === "board" ? "Ver como lista" : "Ver como tablero"}
            </Button>
            <Button render={<Link href="/prospecting/new" />}>Nuevo prospecto</Button>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        {view === "list" && <input type="hidden" name="view" value="list" />}
        <Input name="q" defaultValue={search ?? ""} placeholder="Buscar empresa, persona o email" className="w-full sm:w-64" />
        <select name="status" defaultValue={params.status ?? ""} className={selectClass}>
          <option value="">{view === "board" ? "Activos" : "Todos los estados"}</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LEAD_STATUS_LABELS[status]} ({countByStatus.get(status) ?? 0})
            </option>
          ))}
        </select>
        <select name="ownerId" defaultValue={params.ownerId ?? ""} className={selectClass}>
          <option value="">Todo responsable</option>
          <option value="me">Míos</option>
          <option value="none">Sin responsable</option>
          {users.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.email}
            </option>
          ))}
        </select>
        <select name="channel" defaultValue={params.channel ?? ""} className={selectClass}>
          <option value="">Todo origen</option>
          {SOURCE_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {SOURCE_CHANNEL_LABELS[channel]}
            </option>
          ))}
        </select>
        {campaigns.length > 0 && (
          <select name="campaignId" defaultValue={params.campaignId ?? ""} className={selectClass}>
            <option value="">Toda campaña</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === "1"} />
          Acción vencida
        </label>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-3">
            {ACTIVE_LEAD_STATUSES.map((status) => {
              const column = leads.filter((lead) => lead.status === status);
              return (
                <div key={status} className="bg-muted/15 flex min-h-48 w-[17.5rem] shrink-0 flex-col gap-2 rounded-md border p-2.5 sm:w-72">
                  <p className="text-sm font-semibold">
                    {leadStatusLabel(status)} <span className="text-muted-foreground font-normal">({column.length})</span>
                  </p>
                  {column.length === 0 ? (
                    <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
                      Sin registros.
                    </p>
                  ) : (
                    column.map((lead) => <LeadCard key={lead.id} lead={lead} />)
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <DataTable<LeadRow>
          rows={leads}
          rowHref={(row) => `/prospecting/${row.id}`}
          emptyMessage="No hay prospectos con estos filtros."
          columns={[
            { header: "Prospecto", cell: (row) => <span className="font-medium">{row.title}</span> },
            { header: "Estado", cell: (row) => leadStatusLabel(row.status) },
            {
              header: "Origen",
              cell: (row) =>
                row.firstTouchAttribution
                  ? `${sourceChannelLabel(row.firstTouchAttribution.sourceChannel)}${row.firstTouchAttribution.campaign ? ` · ${row.firstTouchAttribution.campaign.name}` : ""}`
                  : "—",
            },
            { header: "Responsable", cell: (row) => (row.owner ? actorLabel(row.owner) : "—") },
            { header: "Próxima acción", cell: (row) => <NextActionText lead={row} /> },
            { header: "Oportunidades", cell: (row) => row._count.opportunities },
            { header: "Identificado", cell: (row) => row.identifiedAt.toISOString().slice(0, 10) },
          ]}
        />
      )}
    </div>
  );
}
