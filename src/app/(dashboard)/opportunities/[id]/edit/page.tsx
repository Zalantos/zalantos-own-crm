import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { OpportunityForm } from "../../opportunity-form";

export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [opportunity, companies, people] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({ orderBy: { firstName: "asc" } }),
  ]);
  if (!opportunity) notFound();

  return (
    <div>
      <PageHeader title={`Editar ${opportunity.name}`} />
      <OpportunityForm
        opportunity={opportunity}
        companies={companies}
        people={people}
        customFieldsSection={
          <CustomFieldsFormSection
            entityType="opportunity"
            entityId={opportunity.id}
          />
        }
      />
    </div>
  );
}
