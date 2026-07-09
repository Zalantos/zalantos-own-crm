import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { DeleteRecordSection } from "@/components/shared/delete-record-section";
import { PersonForm } from "../../person-form";
import { deletePerson } from "../../actions";

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = await requireOrgContext();
  const [person, companies] = await Promise.all([
    db.person.findUnique({ where: { id } }),
    db.company.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!person) notFound();

  return (
    <div>
      <PageHeader title={`Editar ${person.firstName} ${person.lastName}`} />
      <PersonForm
        person={person}
        companies={companies}
        customFieldsSection={
          <CustomFieldsFormSection entityType="person" entityId={person.id} />
        }
      />
      <div className="mt-8 max-w-2xl">
        <DeleteRecordSection
          title="Eliminar contacto"
          description={`Esta acción es irreversible. ${person.firstName} ${person.lastName} se desvinculará de sus oportunidades, actividades y notas.`}
          confirmMessage={`¿Eliminar a ${person.firstName} ${person.lastName}? Se desvinculará de oportunidades, actividades y notas.`}
          buttonLabel="Eliminar contacto"
          errorMessage="No se pudo eliminar el contacto. Intenta de nuevo."
          action={deletePerson.bind(null, person.id)}
        />
      </div>
    </div>
  );
}
