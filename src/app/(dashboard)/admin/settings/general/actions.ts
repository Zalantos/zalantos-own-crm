"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgAdminContext } from "@/lib/tenant";
import { prismaSystem } from "@/lib/prisma";

const settingsSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  brandName: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v : undefined),
    z.string().optional(),
  ),
  currency: z.string().trim().length(3, "Usá el código ISO de 3 letras (ej. CLP)"),
  timezone: z.string().trim().min(1),
  locale: z.string().trim().min(1),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
});

export type SettingsFormState = { error?: string; success?: string } | undefined;

// Organization no se toca via el cliente de tenant (forOrg lo prohíbe a
// propósito): esta action, aunque exige rol ADMIN de la org, escribe con el
// cliente system porque el propio registro Organization queda fuera del
// alcance del filtro por organizationId.
export async function updateOrgSettings(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { org } = await requireOrgAdminContext();

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá el formulario." };
  }

  await prismaSystem.organization.update({
    where: { id: org.id },
    data: {
      name: parsed.data.name,
      brandName: parsed.data.brandName ?? null,
      currency: parsed.data.currency.toUpperCase(),
      timezone: parsed.data.timezone,
      locale: parsed.data.locale,
      accentColor: parsed.data.accentColor,
    },
  });

  revalidatePath("/admin/settings/general");
  revalidatePath("/", "layout");
  return { success: "Configuración guardada." };
}
