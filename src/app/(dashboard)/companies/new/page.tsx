import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsFormSection } from "@/components/shared/custom-fields/custom-fields-form-section";
import { CompanyForm } from "../company-form";

export default function NewCompanyPage() {
  return (
    <div>
      <PageHeader title="Nueva empresa" />
      <CompanyForm
        customFieldsSection={<CustomFieldsFormSection entityType="company" />}
      />
    </div>
  );
}
