"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgAdminContext } from "@/lib/tenant";
import { normalizeCampaignKey } from "@/lib/commercial/attribution";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const campaignSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  key: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  channel: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  startsAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  endsAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
});

export type CampaignFormState = { error: string } | { ok: true } | undefined;

export async function createCampaign(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  const { org, db } = await requireOrgAdminContext();
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  // La key debe coincidir con utm_campaign / campaign_id que envía la web.
  const key = normalizeCampaignKey(parsed.data.key ?? parsed.data.name);
  if (!key) return { error: "La key de la campaña no es válida." };
  try {
    await db.campaign.create({
      data: {
        organizationId: org.id,
        key,
        name: parsed.data.name,
        channel: parsed.data.channel ?? null,
        startsAt: parsed.data.startsAt ?? null,
        endsAt: parsed.data.endsAt ?? null,
      },
    });
  } catch {
    return { error: `Ya existe una campaña con la key "${key}".` };
  }
  revalidatePath("/admin/settings/campaigns");
  return { ok: true };
}

export async function toggleCampaign(id: string, isActive: boolean) {
  const { db } = await requireOrgAdminContext();
  await db.campaign.updateMany({ where: { id }, data: { isActive } });
  revalidatePath("/admin/settings/campaigns");
}
