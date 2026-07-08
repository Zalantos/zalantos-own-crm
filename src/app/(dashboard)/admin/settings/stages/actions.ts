"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgAdminContext, withOrgTransaction } from "@/lib/tenant";
import { handleMutationError } from "@/lib/prisma-errors";
import type { TenantClient } from "@/lib/tenant";

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(COMBINING_DIACRITICS, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^_|_$)/g, "") || "etapa"
  );
}

async function uniqueKey(db: TenantClient, base: string) {
  let candidate = base;
  let suffix = 2;
  while (await db.pipelineStage.findFirst({ where: { key: candidate } })) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

const stageSchema = z.object({
  label: z.string().trim().min(1, "El nombre es obligatorio"),
  color: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v : undefined),
    z.string().optional(),
  ),
  outcome: z.enum(["none", "won", "lost"]).default("none"),
});

export type StageFormState = { error?: string } | undefined;

export async function createStage(
  _prevState: StageFormState,
  formData: FormData,
): Promise<StageFormState> {
  const { org, db } = await requireOrgAdminContext();
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá el formulario." };
  }

  const key = await uniqueKey(db, slugify(parsed.data.label));
  const maxSortOrder = await db.pipelineStage.aggregate({
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  await withOrgTransaction(org.id, async (tx) => {
    if (parsed.data.outcome === "won") {
      await tx.pipelineStage.updateMany({
        where: { organizationId: org.id, isWon: true },
        data: { isWon: false },
      });
    }
    if (parsed.data.outcome === "lost") {
      await tx.pipelineStage.updateMany({
        where: { organizationId: org.id, isLost: true },
        data: { isLost: false },
      });
    }
    await tx.pipelineStage.create({
      data: {
        organizationId: org.id,
        key,
        label: parsed.data.label,
        color: parsed.data.color,
        sortOrder: nextSortOrder,
        isWon: parsed.data.outcome === "won",
        isLost: parsed.data.outcome === "lost",
      },
    });
  });

  revalidatePath("/admin/settings/stages");
}

export async function updateStage(
  id: string,
  _prevState: StageFormState,
  formData: FormData,
): Promise<StageFormState> {
  const { org } = await requireOrgAdminContext();
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá el formulario." };
  }

  try {
    await withOrgTransaction(org.id, async (tx) => {
      if (parsed.data.outcome === "won") {
        await tx.pipelineStage.updateMany({
          where: { organizationId: org.id, isWon: true, id: { not: id } },
          data: { isWon: false },
        });
      }
      if (parsed.data.outcome === "lost") {
        await tx.pipelineStage.updateMany({
          where: { organizationId: org.id, isLost: true, id: { not: id } },
          data: { isLost: false },
        });
      }
      await tx.pipelineStage.update({
        where: { id, organizationId: org.id },
        data: {
          label: parsed.data.label,
          color: parsed.data.color,
          isWon: parsed.data.outcome === "won",
          isLost: parsed.data.outcome === "lost",
        },
      });
    });
  } catch (error) {
    handleMutationError(error);
  }

  revalidatePath("/admin/settings/stages");
}

// Intercambia sortOrder con la etapa activa vecina (arriba o abajo).
export async function moveStage(id: string, direction: "up" | "down") {
  const { org, db } = await requireOrgAdminContext();

  const stages = await db.pipelineStage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const index = stages.findIndex((s) => s.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= stages.length) return;

  const current = stages[index];
  const target = stages[targetIndex];

  // Swap vía un valor temporal: @@unique([organizationId, sortOrder]) no es
  // deferrable, así que un swap directo en 2 updates viola la constraint en
  // el primer statement (el valor destino todavía está ocupado).
  await withOrgTransaction(org.id, async (tx) => {
    await tx.pipelineStage.update({
      where: { id: current.id, organizationId: org.id },
      data: { sortOrder: -1 },
    });
    await tx.pipelineStage.update({
      where: { id: target.id, organizationId: org.id },
      data: { sortOrder: current.sortOrder },
    });
    await tx.pipelineStage.update({
      where: { id: current.id, organizationId: org.id },
      data: { sortOrder: target.sortOrder },
    });
  });

  revalidatePath("/admin/settings/stages");
}

export async function deactivateStage(id: string) {
  const { db } = await requireOrgAdminContext();
  await db.pipelineStage.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/admin/settings/stages");
}

export async function reactivateStage(id: string) {
  const { db } = await requireOrgAdminContext();
  const maxSortOrder = await db.pipelineStage.aggregate({
    _max: { sortOrder: true },
  });
  await db.pipelineStage.update({
    where: { id },
    data: { isActive: true, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 },
  });
  revalidatePath("/admin/settings/stages");
}

export async function deleteStage(
  id: string,
): Promise<{ error?: string } | undefined> {
  const { db } = await requireOrgAdminContext();
  const inUse = await db.opportunity.count({ where: { stageId: id } });
  if (inUse > 0) {
    return {
      error: `Hay ${inUse} oportunidad(es) en esta etapa. Desactivala en vez de borrarla.`,
    };
  }
  try {
    await db.pipelineStage.delete({ where: { id } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/admin/settings/stages");
}
