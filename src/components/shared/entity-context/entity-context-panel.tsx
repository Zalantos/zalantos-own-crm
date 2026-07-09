import {
  ContextProfileCard,
  toContextProfileView,
} from "@/components/shared/entity-context/context-profile-card";
import { ContextSourcesPanel } from "@/components/shared/entity-context/context-sources-panel";
import { ContextUploader } from "@/components/shared/entity-context/context-uploader";
import { EnrichmentProposalReview } from "@/components/shared/entity-context/enrichment-proposal-review";
import type { ReviewProposal } from "@/components/shared/meeting/change-proposal-review";
import type { ContextEntityType } from "@/lib/entity-context/types";
import type { TenantClient } from "@/lib/tenant";
import type { Prisma } from "@prisma/client";

type ProposalWithItems = Prisma.CRMChangeProposalGetPayload<{
  include: { items: true };
}>;

function toReviewProposal(proposal: ProposalWithItems): ReviewProposal {
  return {
    id: proposal.id,
    status: proposal.status,
    confidence: proposal.confidence,
    createdAt: proposal.createdAt.toISOString(),
    items: proposal.items.map((item) => ({
      id: item.id,
      type: item.type,
      entity: item.entity,
      beforeValue: item.beforeValue,
      afterValue: item.afterValue,
      confidence: item.confidence,
      explanation: item.explanation,
      evidence: item.evidence,
      duplicateOfId: item.duplicateOfId,
      approved: item.approved,
      status: item.status,
    })),
  };
}

export async function loadEntityContextData(
  db: TenantClient,
  entityType: ContextEntityType,
  entityId: string,
) {
  // Las propuestas de oportunidades/personas también llevan el companyId
  // denormalizado, así que en la ficha de empresa filtramos a las propias
  // (sin opportunityId ni personId) para no arrastrar las de sus hijos.
  const proposalWhere =
    entityType === "company"
      ? {
          companyId: entityId,
          opportunityId: null,
          personId: null,
          source: "enrichment" as const,
        }
      : entityType === "person"
        ? { personId: entityId, source: "enrichment" as const }
        : { opportunityId: entityId, source: "enrichment" as const };

  const [profile, sources, proposals] = await Promise.all([
    db.entityContextProfile.findFirst({
      where: { entityType, entityId },
    }),
    db.entityContextSource.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
    }),
    db.cRMChangeProposal.findMany({
      where: {
        ...proposalWhere,
        status: { in: ["pending", "partially_approved", "approved"] },
      },
      include: { items: { orderBy: { confidence: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return { profile, sources, proposals };
}

export function EntityContextPanel({
  entityType,
  entityId,
  profile,
  sources,
  proposals,
  formatDateTime,
}: {
  entityType: ContextEntityType;
  entityId: string;
  profile: Awaited<ReturnType<typeof loadEntityContextData>>["profile"];
  sources: Awaited<ReturnType<typeof loadEntityContextData>>["sources"];
  proposals: Awaited<ReturnType<typeof loadEntityContextData>>["proposals"];
  formatDateTime: (value: string | Date) => string;
}) {
  const profileView = profile ? toContextProfileView(profile) : null;
  const sourceViews = sources.map((source) => ({
    id: source.id,
    filename: source.filename,
    sourceType: source.sourceType,
    status: source.status,
    processingError: source.processingError,
    externalRef: source.externalRef,
    createdAt: source.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <ContextUploader entityType={entityType} entityId={entityId} />
      <ContextProfileCard
        profile={profileView}
        formatDateTime={formatDateTime}
      />
      {proposals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Propuestas pendientes</h3>
          {proposals.map((proposal) => (
            <EnrichmentProposalReview
              key={proposal.id}
              proposal={toReviewProposal(proposal)}
              entityType={entityType}
              entityId={entityId}
            />
          ))}
        </div>
      )}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Fuentes</h3>
        <ContextSourcesPanel
          sources={sourceViews}
          formatDateTime={formatDateTime}
        />
      </div>
    </div>
  );
}
