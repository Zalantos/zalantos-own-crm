"use server";

import { revalidatePath } from "next/cache";
import { businessHolidaySchema } from "@/lib/zod/commercial";
import { requireOrgAdminContext } from "@/lib/tenant";
import { handleMutationError } from "@/lib/prisma-errors";

export type HolidayFormState = { error?: string; success?: string } | undefined;

export async function createHoliday(
  _previousState: HolidayFormState,
  formData: FormData,
): Promise<HolidayFormState> {
  const { db, org } = await requireOrgAdminContext();
  const parsed = businessHolidaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa el feriado." };
  }

  try {
    await db.businessHoliday.create({
      data: { organizationId: org.id, ...parsed.data },
    });
  } catch (error) {
    try {
      handleMutationError(error);
    } catch {
      return { error: "Ya existe un feriado para esa fecha." };
    }
  }

  revalidatePath("/admin/settings/holidays");
  return { success: "Feriado agregado." };
}

export async function deleteHoliday(id: string) {
  const { db } = await requireOrgAdminContext();
  await db.businessHoliday.delete({ where: { id } });
  revalidatePath("/admin/settings/holidays");
}
