import { requireOrgAdminContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampaignForm } from "./campaign-form";
import { toggleCampaign } from "./actions";

export default async function CampaignsPage() {
  const { db } = await requireOrgAdminContext();
  const campaigns = await db.campaign.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { attributions: true } } },
  });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Campañas"
        description="Iniciativas que generan contactos. La key debe coincidir con utm_campaign o campaign_id que envía la web."
      />
      <CampaignForm />
      <div className="max-w-3xl space-y-2">
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">
                {campaign.name} <span className="text-muted-foreground font-normal">· {campaign.key}</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {campaign.channel ?? "Sin canal"} · {campaign._count.attributions} contactos atribuidos
                {campaign.createdVia === "inbound" ? " · creada al recibir un utm desconocido" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!campaign.isActive && <Badge variant="outline">Inactiva</Badge>}
              <form action={toggleCampaign.bind(null, campaign.id, !campaign.isActive)}>
                <Button type="submit" size="sm" variant="ghost">
                  {campaign.isActive ? "Desactivar" : "Activar"}
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
