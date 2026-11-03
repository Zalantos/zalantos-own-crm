import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { getActiveOrgUsers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { NewPartnerButton } from "@/components/shared/partners/partner-forms";
import {
  ALLIANCE_STAGES,
  ALLIANCE_STAGE_LABELS,
  ALLIANCE_STATUS_LABELS,
  ALLIANCE_TYPE_LABELS,
  isAllianceStatus,
} from "@/lib/commercial/partners";
import { nextActionState } from "@/lib/commercial/next-action";

const partnerSelect = {
  id: true,
  displayName: true,
  kind: true,
  allianceStage: true,
  allianceStatus: true,
  allianceStatusReason: true,
  allianceType: true,
  nextStep: true,
  nextStepDueDate: true,
  owner: { select: { name: true, email: true } },
  _count: { select: { opportunityAssignments: true, referredAttributions: true } },
} satisfies Prisma.CommercialPartnerSelect;

type PartnerRow = Prisma.CommercialPartnerGetPayload<{ select: typeof partnerSelect }>;

function PartnerCard({ partner }: { partner: PartnerRow }) {
  const state = nextActionState(partner.nextStep, partner.nextStepDueDate);
  return (
    <Link
      href={`/partners/${partner.id}`}
      className="ring-foreground/10 bg-card block space-y-1 rounded-lg p-2.5 text-sm shadow-sm ring-1 hover:shadow-md"
    >
      <p className="font-medium">{partner.displayName}</p>
      <p className="text-muted-foreground text-xs">
        {partner.allianceType
          ? ALLIANCE_TYPE_LABELS[partner.allianceType as keyof typeof ALLIANCE_TYPE_LABELS] ?? partner.allianceType
          : "Tipo sin definir"}
        {partner.owner ? ` · ${partner.owner.name ?? partner.owner.email}` : ""}
      </p>
      <p className="text-muted-foreground text-xs">
        {partner._count.referredAttributions} referidos · {partner._count.opportunityAssignments} oportunidades
      </p>
      <p className={`line-clamp-2 text-xs ${state === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>
        {partner.nextStep
          ? `${partner.nextStepDueDate ? `${partner.nextStepDueDate.toISOString().slice(0, 10)} · ` : ""}${partner.nextStep}`
          : "Sin próxima acción"}
      </p>
    </Link>
  );
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const { db } = await requireOrgContext();
  const statusFilter = status && isAllianceStatus(status) ? status : "open";
  const [partners, outside, companies, people, users] = await Promise.all([
    db.commercialPartner.findMany({
      where: { allianceStage: { not: null }, allianceStatus: statusFilter },
      select: partnerSelect,
      orderBy: [{ nextStepDueDate: { sort: "asc", nulls: "last" } }, { displayName: "asc" }],
    }),
    db.commercialPartner.findMany({
      where: { allianceStage: null, isActive: true },
      select: partnerSelect,
      orderBy: { displayName: "asc" },
    }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.person.findMany({ orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    getActiveOrgUsers(db),
  ]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Alianzas"
        description="Desarrollo de relaciones con partners que generan prospectos y oportunidades."
        actions={
          <NewPartnerButton
            companies={companies.map((company) => ({ id: company.id, label: company.name }))}
            people={people.map((person) => ({ id: person.id, label: `${person.firstName} ${person.lastName}` }))}
            users={users.map((user) => ({ id: user.id, label: user.name ?? user.email }))}
          />
        }
      />

      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        {(["open", "paused", "discarded"] as const).map((value) => (
          <Link
            key={value}
            href={value === "open" ? "/partners" : `/partners?status=${value}`}
            className={value === statusFilter ? "font-semibold" : "text-muted-foreground hover:underline"}
          >
            {ALLIANCE_STATUS_LABELS[value]}
          </Link>
        ))}
      </div>

      {statusFilter === "open" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-3">
            {ALLIANCE_STAGES.map((stage) => {
              const column = partners.filter((partner) => partner.allianceStage === stage);
              return (
                <div key={stage} className="bg-muted/15 flex min-h-40 w-64 shrink-0 flex-col gap-2 rounded-md border p-2.5">
                  <p className="text-sm font-semibold">
                    {ALLIANCE_STAGE_LABELS[stage]} <span className="text-muted-foreground font-normal">({column.length})</span>
                  </p>
                  {column.map((partner) => (
                    <PartnerCard key={partner.id} partner={partner} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {partners.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin alianzas en este estado.</p>
          ) : (
            partners.map((partner) => (
              <div key={partner.id} className="space-y-1">
                <PartnerCard partner={partner} />
                {partner.allianceStatusReason && (
                  <p className="text-muted-foreground px-1 text-xs">Motivo: {partner.allianceStatusReason}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {outside.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Partners del catálogo fuera del pipeline ({outside.length})</h2>
          <p className="text-muted-foreground mb-2 text-xs">
            Partners existentes (p. ej. usados en ofertas) cuya etapa de alianza no se registró. Ábrelos para ubicarlos en una etapa.
          </p>
          <div className="flex flex-wrap gap-2">
            {outside.map((partner) => (
              <Link key={partner.id} href={`/partners/${partner.id}`}>
                <Badge variant="outline">{partner.displayName}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
