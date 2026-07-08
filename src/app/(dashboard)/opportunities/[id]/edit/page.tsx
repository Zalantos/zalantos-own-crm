import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { OpportunityForm } from "../../opportunity-form";

export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = await requireOrgContext();
  const [opportunity, companies, people, stages] = await Promise.all([
    db.opportunity.findUnique({ where: { id } }),
    db.company.findMany({ orderBy: { name: "asc" } }),
    db.person.findMany({ orderBy: { firstName: "asc" } }),
    getOrgStages(db),
  ]);
  if (!opportunity) notFound();

  return (
    <div>
      <PageHeader title={`Editar ${opportunity.name}`} />
      <OpportunityForm
        opportunity={opportunity}
        companies={companies}
        people={people}
        stages={stages}
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
