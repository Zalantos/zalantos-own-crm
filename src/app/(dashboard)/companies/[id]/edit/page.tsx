import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { DeleteRecordSection } from "@/components/shared/delete-record-section";
import { CompanyForm } from "../../company-form";
import { deleteCompany } from "../../actions";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, db } = await requireOrgContext();
  const company = await db.company.findUnique({ where: { id } });
  if (!company) notFound();
  const canDelete = user.role === "ADMIN" || company.createdById === user.id;

  return (
    <div>
      <PageHeader title={`Editar ${company.name}`} />
      <CompanyForm
        company={company}
        customFieldsSection={
          <CustomFieldsFormSection entityType="company" entityId={company.id} />
        }
      />
      {canDelete && (
        <div className="mt-8 max-w-2xl">
          <DeleteRecordSection
            title="Eliminar empresa"
            description={`Esta acción es irreversible. ${company.name}, sus oportunidades, reuniones y timeline asociado se eliminarán; actividades y notas relacionadas quedarán desvinculadas.`}
            confirmMessage={`¿Eliminar la empresa ${company.name}? Esta acción no se puede deshacer.`}
            buttonLabel="Eliminar empresa"
            errorMessage="No se pudo eliminar la empresa. Intenta de nuevo."
            action={deleteCompany.bind(null, company.id)}
          />
        </div>
      )}
    </div>
  );
}
