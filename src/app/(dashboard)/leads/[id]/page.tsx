import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { LeadStatusBadge } from "@/components/shared/leads/lead-status-badge";
import { LeadActions } from "@/components/shared/leads/lead-actions";
import { createFormatters } from "@/lib/format";
import { actorLabel } from "@/lib/traceability";

export default async function InboundLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, db } = await requireOrgContext();

  const lead = await db.inboundLead.findUnique({
    where: { id },
    include: {
      reviewedBy: { select: { name: true, email: true } },
      convertedCompany: { select: { id: true, name: true } },
      convertedPerson: { select: { id: true, firstName: true, lastName: true } },
      convertedOpportunity: { select: { id: true, name: true } },
    },
  });
  if (!lead) notFound();

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  const formatters = createFormatters(org);

  const matchingCompanies = lead.company
    ? await db.company.findMany({
        where: { name: { contains: lead.company, mode: "insensitive" } },
        select: { id: true, name: true },
        take: 5,
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title={fullName || "Lead sin nombre"}
        description={lead.company ?? undefined}
        actions={<LeadStatusBadge status={lead.status} />}
      />

      <div className="max-w-2xl space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Email</p>
              <p>{lead.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Origen</p>
              <p>{lead.source}</p>
            </div>
            {lead.page && (
              <div>
                <p className="text-muted-foreground text-xs">Página</p>
                <p>{lead.page}</p>
              </div>
            )}
            {lead.message && (
              <div>
                <p className="text-muted-foreground text-xs">Mensaje</p>
                <p className="whitespace-pre-wrap">{lead.message}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Recibido</p>
              <p>{formatters.dateTime(lead.createdAt)}</p>
            </div>
            {lead.reviewedAt && (
              <div>
                <p className="text-muted-foreground text-xs">Revisado</p>
                <p>
                  {formatters.dateTime(lead.reviewedAt)} ·{" "}
                  {actorLabel(lead.reviewedBy)}
                </p>
              </div>
            )}
            {lead.status === "converted" && (
              <div>
                <p className="text-muted-foreground text-xs">Convertido a</p>
                <p className="space-x-2">
                  {lead.convertedCompany && (
                    <Link
                      href={`/companies/${lead.convertedCompany.id}`}
                      className="text-primary hover:underline"
                    >
                      {lead.convertedCompany.name}
                    </Link>
                  )}
                  {lead.convertedPerson && (
                    <Link
                      href={`/people/${lead.convertedPerson.id}`}
                      className="text-primary hover:underline"
                    >
                      {lead.convertedPerson.firstName} {lead.convertedPerson.lastName}
                    </Link>
                  )}
                  {lead.convertedOpportunity && (
                    <Link
                      href={`/opportunities/${lead.convertedOpportunity.id}`}
                      className="text-primary hover:underline"
                    >
                      {lead.convertedOpportunity.name}
                    </Link>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <LeadActions
          leadId={lead.id}
          status={lead.status}
          suggestedOpportunityName={
            lead.company ? `${lead.company} · Inbound` : fullName || "Nuevo lead"
          }
          matchingCompanies={matchingCompanies}
          defaultCompanyName={lead.company ?? ""}
        />
      </div>
    </div>
  );
}
