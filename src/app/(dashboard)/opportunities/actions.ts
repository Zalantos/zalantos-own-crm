"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import {
  opportunityCreateSchema,
  opportunityStageChangeSchema,
  opportunityUpdateSchema,
} from "@/lib/zod/opportunity";
import { getOrgStages } from "@/lib/pipeline/stages";
import {
  deleteCustomFieldValues,
  upsertCustomFieldValues,
} from "@/lib/custom-fields/merge";
import { evaluateWorkflows } from "@/lib/workflows/engine";
import { handleMutationError } from "@/lib/prisma-errors";
import { appendTimelineEvent } from "@/lib/timeline";
import type { TenantClient } from "@/lib/tenant";

export type FormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;

// La etapa debe existir y estar activa dentro de la org; si el formulario no
// mandó ninguna se usa la primera del pipeline.
async function resolveStageId(
  db: TenantClient,
  stageId: string | undefined,
): Promise<string> {
  const stages = await getOrgStages(db);
  if (!stageId) {
    const first = stages[0];
    if (!first) throw new Error("La organización no tiene etapas de pipeline.");
    return first.id;
  }
  const stage = stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error("Etapa inválida.");
  return stage.id;
}

export async function createOpportunity(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = opportunityCreateSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // La empresa debe pertenecer a la org (una id ajena es invisible).
  const company = await db.company.findUnique({
    where: { id: parsed.data.companyId },
    select: { id: true },
  });
  if (!company) {
    return { error: "La empresa seleccionada no existe." };
  }

  const { stageId, ...data } = parsed.data;
  const opportunity = await db.opportunity.create({
    data: {
      ...data,
      organizationId: org.id,
      stageId: await resolveStageId(db, stageId),
      createdById: user.id,
      createdVia: "manual",
    },
  });
  await upsertCustomFieldValues(db, org.id, "opportunity", opportunity.id, formData);
  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: opportunity.companyId,
    opportunityId: opportunity.id,
    type: "opportunity_created",
    title: `Oportunidad creada: ${opportunity.name}`,
    actorId: user.id,
  });
  revalidatePath("/opportunities");
  revalidatePath(`/companies/${opportunity.companyId}`);
  redirect(`/opportunities/${opportunity.id}`);
}

export async function updateOpportunity(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = opportunityUpdateSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, stageId, ...data } = parsed.data;
  const before = await db.opportunity.findUnique({
    where: { id },
    include: { stage: { select: { id: true, label: true } } },
  });
  if (!before) redirect("/opportunities");

  let opportunity;
  try {
    opportunity = await db.opportunity.update({
      where: { id },
      data: {
        ...data,
        ...(stageId ? { stageId: await resolveStageId(db, stageId) } : {}),
      },
      include: { stage: { select: { id: true, key: true, label: true } } },
    });
  } catch (error) {
    handleMutationError(error);
  }
  await upsertCustomFieldValues(db, org.id, "opportunity", id, formData);

  if (stageId && opportunity.stage.id !== before.stage.id) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: opportunity.companyId,
      opportunityId: opportunity.id,
      type: "stage_changed",
      title: "Cambio de etapa",
      summary: `${before.stage.label} → ${opportunity.stage.label}`,
      actorId: user.id,
    });
    await evaluateWorkflows(db, org.id, {
      entityType: "opportunity",
      entityId: opportunity.id,
      eventName: "stage_changed",
      actorId: user.id,
      before: { stage: before.stage.id },
      after: { stage: opportunity.stage.id },
    });
  }
  if (
    "nextStep" in data &&
    (data.nextStep !== before.nextStep ||
      opportunity.nextStepDueDate?.getTime() !== before.nextStepDueDate?.getTime())
  ) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: opportunity.companyId,
      opportunityId: opportunity.id,
      type: "next_step_updated",
      title: "Próximo paso actualizado",
      summary: opportunity.nextStep ?? undefined,
      actorId: user.id,
    });
  }

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
  revalidatePath(`/companies/${opportunity.companyId}`);
  redirect(`/opportunities/${id}`);
}

export async function updateOpportunityStage(id: string, stageId: string) {
  const { user, org, db } = await requireOrgContext();

  const parsed = opportunityStageChangeSchema.safeParse({ id, stageId });
  if (!parsed.success) return;

  const before = await db.opportunity.findUnique({
    where: { id },
    include: { stage: { select: { id: true, label: true } } },
  });
  if (!before) return;

  let opportunity;
  try {
    opportunity = await db.opportunity.update({
      where: { id },
      data: { stageId: await resolveStageId(db, parsed.data.stageId) },
      include: { stage: { select: { id: true, label: true } } },
    });
  } catch (error) {
    handleMutationError(error);
  }

  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: opportunity.companyId,
    opportunityId: opportunity.id,
    type: "stage_changed",
    title: "Cambio de etapa",
    summary: `${before.stage.label} → ${opportunity.stage.label}`,
    actorId: user.id,
  });

  await evaluateWorkflows(db, org.id, {
    entityType: "opportunity",
    entityId: opportunity.id,
    eventName: "stage_changed",
    actorId: user.id,
    before: { stage: before.stage.id },
    after: { stage: opportunity.stage.id },
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
}

export async function deleteOpportunity(id: string) {
  const { org } = await requireOrgContext();
  let opportunity;
  try {
    opportunity = await withOrgTransaction(org.id, async (tx) => {
      await deleteCustomFieldValues(tx, org.id, "opportunity", id);
      return tx.opportunity.delete({
        where: { id, organizationId: org.id },
      });
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/opportunities");
  revalidatePath(`/companies/${opportunity.companyId}`);
  redirect("/opportunities");
}
