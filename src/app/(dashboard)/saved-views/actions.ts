"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant";
import type { EntityType } from "@prisma/client";

export async function createSavedView(
  entityType: EntityType,
  name: string,
  filtersJson: Record<string, string>,
  path: string,
) {
  const { user, org, db } = await requireOrgContext();
  if (!name.trim()) return;

  await db.savedView.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      entityType,
      name: name.trim(),
      filtersJson,
    },
  });
  revalidatePath(path);
}

export async function deleteSavedView(id: string, path: string) {
  const { db } = await requireOrgContext();
  await db.savedView.delete({ where: { id } });
  revalidatePath(path);
}
