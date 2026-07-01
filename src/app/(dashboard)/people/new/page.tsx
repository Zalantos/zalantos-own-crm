import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { PersonForm } from "../person-form";

export default async function NewPersonPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Nueva persona" />
      <PersonForm
        companies={companies}
        defaultCompanyId={companyId}
        customFieldsSection={<CustomFieldsFormSection entityType="person" />}
      />
    </div>
  );
}
