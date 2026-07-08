import { requireOrgAdminContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { GeneralSettingsForm } from "./general-settings-form";

export default async function GeneralSettingsPage() {
  const { org } = await requireOrgAdminContext();

  return (
    <div>
      <PageHeader
        title="Configuración general"
        description="Branding, moneda, zona horaria e idioma de tu organización"
      />
      <div className="max-w-xl">
        <GeneralSettingsForm org={org} />
      </div>
    </div>
  );
}
