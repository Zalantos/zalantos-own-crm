import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { CompanyForm } from "../../company-form";
import { deleteCompany } from "../../actions";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) notFound();
  const canDelete = user.role === "ADMIN" || company.createdById === user.id;

  return (
    <div>
      <PageHeader
        title={`Editar ${company.name}`}
        actions={
          canDelete ? (
            <form action={deleteCompany.bind(null, company.id)}>
              <Button type="submit" variant="destructive">
                Eliminar
              </Button>
            </form>
          ) : undefined
        }
      />
      <CompanyForm
        company={company}
        customFieldsSection={
          <CustomFieldsFormSection entityType="company" entityId={company.id} />
        }
      />
    </div>
  );
}
