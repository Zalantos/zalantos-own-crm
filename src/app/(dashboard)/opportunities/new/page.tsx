import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { OpportunityForm } from "../opportunity-form";

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;
  const [companies, people] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({ orderBy: { firstName: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Nueva oportunidad" />
      <OpportunityForm
        companies={companies}
        people={people}
        defaultCompanyId={companyId}
        customFieldsSection={
          <CustomFieldsFormSection entityType="opportunity" />
        }
      />
    </div>
  );
}
