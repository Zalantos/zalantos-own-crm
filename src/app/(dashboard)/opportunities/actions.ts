"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  opportunityCreateSchema,
  opportunityStageChangeSchema,
  opportunityUpdateSchema,
} from "@/lib/zod/opportunity";
import {
  deleteCustomFieldValues,
  upsertCustomFieldValues,
} from "@/lib/custom-fields/merge";
import { evaluateWorkflows } from "@/lib/workflows/engine";
import { handleMutationError } from "@/lib/prisma-errors";

export type FormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;

export async function createOpportunity(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();

  const parsed = opportunityCreateSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const opportunity = await prisma.opportunity.create({ data: parsed.data });
  await upsertCustomFieldValues("opportunity", opportunity.id, formData);
  revalidatePath("/opportunities");
  revalidatePath(`/companies/${opportunity.companyId}`);
  redirect(`/opportunities/${opportunity.id}`);
}

export async function updateOpportunity(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();

  const parsed = opportunityUpdateSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, ...data } = parsed.data;
  let opportunity;
  try {
    opportunity = await prisma.opportunity.update({ where: { id }, data });
  } catch (error) {
    handleMutationError(error);
  }
  await upsertCustomFieldValues("opportunity", id, formData);
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
  revalidatePath(`/companies/${opportunity.companyId}`);
  redirect(`/opportunities/${id}`);
}

export async function updateOpportunityStage(id: string, stage: string) {
  await requireUser();

  const parsed = opportunityStageChangeSchema.safeParse({ id, stage });
  if (!parsed.success) return;

  const before = await prisma.opportunity.findUnique({ where: { id } });
  if (!before) return;

  let opportunity;
  try {
    opportunity = await prisma.opportunity.update({
      where: { id },
      data: { stage: parsed.data.stage },
    });
  } catch (error) {
    handleMutationError(error);
  }

  await evaluateWorkflows({
    entityType: "opportunity",
    entityId: opportunity.id,
    eventName: "stage_changed",
    before: { stage: before.stage },
    after: { stage: opportunity.stage },
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
}

export async function deleteOpportunity(id: string) {
  await requireUser();
  let opportunity;
  try {
    opportunity = await prisma.$transaction(async (tx) => {
      await deleteCustomFieldValues(tx, "opportunity", id);
      return tx.opportunity.delete({ where: { id } });
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/opportunities");
  revalidatePath(`/companies/${opportunity.companyId}`);
  redirect("/opportunities");
}
