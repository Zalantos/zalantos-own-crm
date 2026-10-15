import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
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
  const [companies, people, stages, users] = await Promise.all([
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
  ]);

  return (
    <div>
      <PageHeader title="Nueva oportunidad" />
      <OpportunityForm
        companies={companies}
        people={people}
        stages={stages}
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
