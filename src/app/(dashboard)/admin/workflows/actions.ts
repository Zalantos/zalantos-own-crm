"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { z } from "zod";
import { EntityType } from "@prisma/client";
import { handleMutationError } from "@/lib/prisma-errors";

const workflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerEntity: z.enum(EntityType),
  triggerEvent: z.string().min(1),
  conditionsJson: z.string(),
  actionsJson: z.string(),
});

export type WorkflowFormState = { error: string } | undefined;

export async function createWorkflow(
  _prevState: WorkflowFormState,
  formData: FormData,
): Promise<WorkflowFormState> {
  await requireAdmin();

  const parsed = workflowSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revisa los campos del formulario." };
  }

  let conditions: unknown;
  let actions: unknown;
  try {
    conditions = JSON.parse(parsed.data.conditionsJson);
    actions = JSON.parse(parsed.data.actionsJson);
  } catch {
    return { error: "Conditions/Actions deben ser JSON válido." };
  }

  await prisma.workflow.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      triggerEntity: parsed.data.triggerEntity,
      triggerEvent: parsed.data.triggerEvent,
      conditionsJson: conditions as object,
      actionsJson: actions as object,
    },
  });

  revalidatePath("/admin/workflows");
}

export async function toggleWorkflowActive(id: string, isActive: boolean) {
  await requireAdmin();
  try {
    await prisma.workflow.update({ where: { id }, data: { isActive } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/admin/workflows");
}

export async function deleteWorkflow(id: string) {
  await requireAdmin();
  try {
    await prisma.workflow.delete({ where: { id } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/admin/workflows");
}
