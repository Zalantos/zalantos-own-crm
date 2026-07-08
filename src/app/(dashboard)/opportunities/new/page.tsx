import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { OpportunityForm } from "../opportunity-form";

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;
  const { db } = await requireOrgContext();
  const [companies, people, stages] = await Promise.all([
    db.company.findMany({ orderBy: { name: "asc" } }),
    db.person.findMany({ orderBy: { firstName: "asc" } }),
    getOrgStages(db),
  ]);

  return (
    <div>
      <PageHeader title="Nueva oportunidad" />
      <OpportunityForm
        companies={companies}
        people={people}
        stages={stages}
        defaultCompanyId={companyId}
        customFieldsSection={
          <CustomFieldsFormSection entityType="opportunity" />
        }
      />
    </div>
  );
}
