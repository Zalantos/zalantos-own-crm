import { requireOrgContext } from "@/lib/tenant";
import { boardStages, getOrgStages } from "@/lib/pipeline/stages";
import { getActiveOrgUsers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { OpportunityForm } from "../opportunity-form";

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;
  const { db, user } = await requireOrgContext();
  const [companies, people, stages, users, campaigns, partners] = await Promise.all([
    db.company.findMany({ orderBy: { name: "asc" } }),
    db.person.findMany({
      include: {
        companyRelationships: {
          where: { endedAt: null },
          select: { companyId: true },
        },
      },
      orderBy: { firstName: "asc" },
    }),
    getOrgStages(db),
    getActiveOrgUsers(db),
    db.campaign.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.commercialPartner.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Nueva oportunidad" />
      <OpportunityForm
        companies={companies}
        people={people}
        stages={boardStages(stages)}
        campaigns={campaigns}
        partners={partners}
        users={users}
        currentUserId={user.id}
        defaultCompanyId={companyId}
        customFieldsSection={
          <CustomFieldsFormSection entityType="opportunity" />
        }
      />
    </div>
  );
}
