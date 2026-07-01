"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import type { EntityType } from "@prisma/client";

export async function createSavedView(
  entityType: EntityType,
  name: string,
  filtersJson: Record<string, string>,
  path: string,
) {
  await requireUser();
  if (!name.trim()) return;

  await prisma.savedView.create({
    data: { entityType, name: name.trim(), filtersJson },
  });
  revalidatePath(path);
}

export async function deleteSavedView(id: string, path: string) {
  await requireUser();
  await prisma.savedView.delete({ where: { id } });
  revalidatePath(path);
}
