import { PageHeader } from "@/components/shared/page-header";
import { CreateOrgForm } from "./create-org-form";

export default function NewOrganizationPage() {
  return (
    <div>
      <PageHeader
        title="Nueva organización"
        description="Crea el tenant; después podrás invitar a su primer admin"
      />
      <div className="max-w-lg">
        <CreateOrgForm />
      </div>
    </div>
  );
}
