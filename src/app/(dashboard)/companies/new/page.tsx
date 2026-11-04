import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { requireOrgContext } from "@/lib/tenant";
import { isWikiEnabledForOrg } from "@/lib/wiki-mcp/authorization";
import { CompanyForm } from "../company-form";

export default async function NewCompanyPage() {
  const { user, org } = await requireOrgContext();

  return (
    <div>
      <PageHeader title="Nueva empresa" />
      <CompanyForm
        canEditWikiClientId={
          user.role === "ADMIN" && isWikiEnabledForOrg(org.id)
        }
        customFieldsSection={<CustomFieldsFormSection entityType="company" />}
      />
    </div>
  );
}
