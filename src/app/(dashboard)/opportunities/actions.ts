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

async function validateOpportunityPeople(
  db: TenantClient,
  companyId: string,
  personIds: Array<string | undefined>,
): Promise<boolean> {
  const ids = [...new Set(personIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return true;
  const linked = await db.person.count({
    where: {
      id: { in: ids },
      OR: [
        { companyId },
        { companyRelationships: { some: { companyId, endedAt: null } } },
      ],
    },
  });
  return linked === ids.length;
}

// El responsable debe ser un usuario activo de la org (db está scopeado al
// tenant, así que un id ajeno no aparece).
async function isValidOwner(
  db: TenantClient,
  ownerId: string,
): Promise<boolean> {
  const owner = await db.user.findFirst({
    where: { id: ownerId, isActive: true },
    select: { id: true },
  });
  return Boolean(owner);
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
  if (
    !(await validateOpportunityPeople(db, parsed.data.companyId, [
      parsed.data.decisionMakerId,
      parsed.data.sponsorId,
    ]))
  ) {
    return {
      error: "El decisor y el sponsor deben estar vinculados a la empresa.",
    };
  }

  if (parsed.data.ownerId && !(await isValidOwner(db, parsed.data.ownerId))) {
    return { error: "El responsable seleccionado no es válido." };
  }
  if (parsed.data.status === "lost" && !parsed.data.lossReason) {
    return {
      error: "Indica el motivo de pérdida.",
      fieldErrors: { lossReason: ["El motivo de pérdida es obligatorio."] },
    };
  }

  const { stageId, ...data } = parsed.data;
  const opportunity = await db.opportunity.create({
    data: {
      ...data,
      // El motivo solo aplica a oportunidades perdidas.
      lossReason: data.status === "lost" ? data.lossReason : undefined,
      ownerId: data.ownerId ?? user.id,
      organizationId: org.id,
      stageId: await resolveStageId(db, stageId),
      createdById: user.id,
      createdVia: "manual",
    },
  });
  await upsertCustomFieldValues(
    db,
    org.id,
    "opportunity",
    opportunity.id,
    formData,
  );
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
  const targetCompanyId = data.companyId ?? before.companyId;
  const company = await db.company.findUnique({
    where: { id: targetCompanyId },
    select: { id: true },
  });
  if (!company) return { error: "La empresa seleccionada no existe." };
  if (
    !(await validateOpportunityPeople(db, targetCompanyId, [
      data.decisionMakerId ?? before.decisionMakerId ?? undefined,
      data.sponsorId ?? before.sponsorId ?? undefined,
    ]))
  ) {
    return {
      error: "El decisor y el sponsor deben estar vinculados a la empresa.",
    };
  }

  if (data.ownerId && !(await isValidOwner(db, data.ownerId))) {
    return { error: "El responsable seleccionado no es válido." };
  }
  const targetStatus = data.status ?? before.status;
  if (targetStatus === "lost" && !(data.lossReason ?? before.lossReason)) {
    return {
      error: "Indica el motivo de pérdida.",
      fieldErrors: { lossReason: ["El motivo de pérdida es obligatorio."] },
    };
  }

  let opportunity;
  try {
    opportunity = await db.opportunity.update({
      where: { id },
      data: {
        ...data,
        // Un campo vacío llega como undefined: se limpia de forma explícita.
        ...(targetStatus !== "lost" ? { lossReason: null } : {}),
        ...(formData.has("ownerId") && !data.ownerId ? { ownerId: null } : {}),
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
      opportunity.nextStepDueDate?.getTime() !==
        before.nextStepDueDate?.getTime())
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
