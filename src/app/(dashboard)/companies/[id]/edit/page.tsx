import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { CompanyForm } from "../../company-form";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) notFound();

  return (
    <div>
      <PageHeader title={`Editar ${company.name}`} />
      <CompanyForm
        company={company}
        customFieldsSection={
          <CustomFieldsFormSection entityType="company" entityId={company.id} />
        }
      />
    </div>
  );
}
