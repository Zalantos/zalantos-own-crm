import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { PersonForm } from "../../person-form";

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [person, companies] = await Promise.all([
    prisma.person.findUnique({ where: { id } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
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
    </div>
  );
}
