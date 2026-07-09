import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { DeleteRecordSection } from "@/components/shared/delete-record-section";
import { OpportunityForm } from "../../opportunity-form";
import { deleteOpportunity } from "../../actions";

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
      <div className="mt-8 max-w-2xl">
        <DeleteRecordSection
          title="Eliminar oportunidad"
          description={`Esta acción es irreversible. ${opportunity.name} se eliminará y sus actividades, notas y reuniones quedarán desvinculadas de la oportunidad.`}
          confirmMessage={`¿Eliminar la oportunidad ${opportunity.name}? Esta acción no se puede deshacer.`}
          buttonLabel="Eliminar oportunidad"
          errorMessage="No se pudo eliminar la oportunidad. Intenta de nuevo."
          action={deleteOpportunity.bind(null, opportunity.id)}
        />
      </div>
    </div>
  );
}
