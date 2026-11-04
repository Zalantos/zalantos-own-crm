"use server";

import { after } from "next/server";
import { linkAttributionReferrersTx } from "@/lib/commercial/actor-service";
import { refreshRecordAlerts } from "@/lib/commercial/alert-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import {
  opportunityCreateSchema,
  opportunityStatusChangeSchema,
  opportunityUpdateSchema,
  proposalSentSchema,
  rumboHandoffSchema,
} from "@/lib/zod/opportunity";
import { boardStages, getOrgStages } from "@/lib/pipeline/stages";
import { checkStageTransition } from "@/lib/opportunities/stage-gates";
import {
  deleteCustomFieldValues,
  upsertCustomFieldValues,
} from "@/lib/custom-fields/merge";
import { handleMutationError } from "@/lib/prisma-errors";
import { appendTimelineEvent } from "@/lib/timeline";
import type { TenantClient } from "@/lib/tenant";
import { createAttribution, hasAttributionData } from "@/lib/commercial/attribution";
import { recordStageTransition } from "@/lib/commercial/history";
import {
  changeOpportunityStage,
  changeOpportunityStatus,
  recordProposalSent,
} from "@/lib/commercial/opportunity-service";
import { requestRumboHandoff } from "@/lib/commercial/rumbo";

export type FormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

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
async function isValidOwner(db: TenantClient, ownerId: string): Promise<boolean> {
  const owner = await db.user.findFirst({
    where: { id: ownerId, isActive: true },
    select: { id: true },
  });
  return Boolean(owner);
}

function revalidateOpportunity(id: string, companyId?: string) {
  revalidatePath("/opportunities");
  revalidatePath("/opportunities/list");
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/dashboard");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function createOpportunity(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = opportunityCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const {
    stageId,
    sourceChannel,
    campaignId,
    referrerPersonId,
    referrerPartnerId,
    sourceDetail,
    ...data
  } = parsed.data;

  const company = await db.company.findUnique({
    where: { id: data.companyId },
    select: { id: true },
  });
  if (!company) return { error: "La empresa seleccionada no existe." };
  if (!(await validateOpportunityPeople(db, data.companyId, [data.decisionMakerId, data.sponsorId]))) {
    return { error: "El decisor y el sponsor deben estar vinculados a la empresa." };
  }
  const ownerId = data.ownerId ?? user.id;
  if (!(await isValidOwner(db, ownerId))) {
    return { error: "El responsable seleccionado no es válido." };
  }

  // Nueva oportunidad: solo en etapas operativas (no terminales).
  const stages = boardStages(await getOrgStages(db));
  const stage = stageId ? stages.find((candidate) => candidate.id === stageId) : stages[0];
  if (!stage) return { error: "Etapa inválida." };
  // Crear en una etapa avanzada exige las compuertas de avance desde Discovery.
  const gate = checkStageTransition(null, stage.key, {
    status: "open",
    mainPain: data.mainPain ?? null,
    proposalDecisionAt: null,
    proposalSentAt: null,
    hasSentOffer: false,
    hasInteractionAfterProposal: false,
  });
  if (!gate.ok) return { error: gate.error, fieldErrors: { stageId: [gate.error] } };

  let opportunityId: string;
  try {
    opportunityId = await withOrgTransaction(org.id, async (tx) => {
      const attribution = hasAttributionData({
        sourceChannel,
        campaignId,
        referrerPersonId,
        referrerPartnerId,
        sourceDetail,
      })
        ? await createAttribution(
            tx,
            { organizationId: org.id, actorId: user.id, method: "manual" },
            { sourceChannel, campaignId, referrerPersonId, referrerPartnerId, sourceDetail },
          )
        : null;
      const now = new Date();
      const opportunity = await tx.opportunity.create({
        data: {
          ...data,
          organizationId: org.id,
          ownerId,
          stageId: stage.id,
          status: "open",
          statusChangedAt: now,
          nextStepUpdatedAt: data.nextStep ? now : null,
          firstTouchAttributionId: attribution?.id ?? null,
          createdById: user.id,
          createdVia: "manual",
        },
        select: { id: true, name: true, companyId: true },
      });
      await recordStageTransition(tx, {
        organizationId: org.id,
        opportunityId: opportunity.id,
        stage,
        actorId: user.id,
        source: "manual",
        at: now,
      });
      await linkAttributionReferrersTx(
        tx,
        { organizationId: org.id, userId: user.id, source: "manual" },
        attribution?.id ?? null,
        { type: "opportunity", id: opportunity.id },
      );
      await appendTimelineEvent(tx, {
        organizationId: org.id,
        companyId: opportunity.companyId,
        opportunityId: opportunity.id,
        type: "opportunity_created",
        title: `Oportunidad creada: ${opportunity.name}`,
        summary: stage.label,
        actorId: user.id,
      });
      return opportunity.id;
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear la oportunidad." };
  }
  await upsertCustomFieldValues(db, org.id, "opportunity", opportunityId, formData);
  revalidateOpportunity(opportunityId, data.companyId);
  redirect(`/opportunities/${opportunityId}`);
}

export async function updateOpportunity(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = opportunityUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, stageId, ...data } = parsed.data;
  const before = await db.opportunity.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      companyId: true,
      ownerId: true,
      decisionMakerId: true,
      sponsorId: true,
      nextStep: true,
      nextStepDueDate: true,
      stageId: true,
    },
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
    return { error: "El decisor y el sponsor deben estar vinculados a la empresa." };
  }
  if (data.ownerId && !(await isValidOwner(db, data.ownerId))) {
    return { error: "El responsable seleccionado no es válido." };
  }
  const clearsOwner = formData.has("ownerId") && !data.ownerId;
  if (clearsOwner && (before.status === "open" || before.status === "paused")) {
    return {
      error: "Una oportunidad activa debe tener responsable.",
      fieldErrors: { ownerId: ["Selecciona un responsable."] },
    };
  }

  // Los campos vacíos llegan como undefined: los de texto/fecha que vinieron
  // en el form se limpian explícitamente.
  const cleared: Record<string, null> = {};
  for (const field of [
    "nextStep",
    "nextStepDueDate",
    "expectedCloseDate",
    "situation",
    "impact",
    "criticalEvent",
    "criticalEventDate",
    "decisionProcess",
    "sprint0Status",
    "sprint0ScheduledAt",
    "sprint0CompletedAt",
    "diagnosisDeliveredAt",
    "expectedResponseAt",
    "recurringValue",
    "estimatedValue",
    "probability",
  ] as const) {
    if (formData.has(field) && data[field] === undefined) cleared[field] = null;
  }
  const nextStepChanged =
    "nextStep" in data &&
    (data.nextStep !== (before.nextStep ?? undefined) ||
      (data.nextStepDueDate?.getTime() ?? null) !== (before.nextStepDueDate?.getTime() ?? null));

  let opportunity;
  try {
    opportunity = await db.opportunity.update({
      where: { id },
      data: {
        ...data,
        ...cleared,
        ...(clearsOwner ? { ownerId: null } : {}),
        ...(nextStepChanged ? { nextStepUpdatedAt: new Date() } : {}),
      },
      select: { id: true, companyId: true, nextStep: true },
    });
  } catch (error) {
    handleMutationError(error);
  }
  await upsertCustomFieldValues(db, org.id, "opportunity", id, formData);

  if (nextStepChanged) {
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

  // La etapa pasa por las compuertas de avance (mismo servicio que el Kanban).
  if (stageId && stageId !== before.stageId) {
    const result = await changeOpportunityStage(
      { db, organizationId: org.id, actorId: user.id, source: "manual" },
      { opportunityId: id, stage: stageId },
    );
    if (!result.ok) {
      revalidateOpportunity(id, opportunity.companyId);
      return { error: `Cambios guardados, pero la etapa no cambió: ${result.error}` };
    }
  }

  revalidateOpportunity(id, opportunity.companyId);
  redirect(`/opportunities/${id}`);
}

// Kanban, selector de etapa: devuelve el error de compuerta para mostrarlo.
export async function updateOpportunityStage(
  id: string,
  stageId: string,
): Promise<ActionResult> {
  const { user, org, db } = await requireOrgContext();
  const result = await changeOpportunityStage(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    { opportunityId: id, stage: stageId },
  );
  after(() => refreshRecordAlerts(db, org.id, { entity: "opportunity", id }));
  revalidateOpportunity(id);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function changeOpportunityStatusAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, db } = await requireOrgContext();
  const parsed = opportunityStatusChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos del cambio de estado." };
  const { id, ...change } = parsed.data;
  const result = await changeOpportunityStatus(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    id,
    change,
  );
  after(() => refreshRecordAlerts(db, org.id, { entity: "opportunity", id }));
  revalidateOpportunity(id);
  return result.ok
    ? { ok: true, message: "Estado actualizado." }
    : { ok: false, error: result.error };
}

export async function recordProposalAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, db } = await requireOrgContext();
  const parsed = proposalSentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Indica una fecha válida." };
  const result = await recordProposalSent(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    {
      opportunityId: parsed.data.id,
      sentAt: parsed.data.sentAt,
      expectedResponseAt: parsed.data.expectedResponseAt ?? null,
      decisionOnly: parsed.data.mode === "decision",
    },
  );
  revalidateOpportunity(parsed.data.id);
  return result.ok
    ? {
        ok: true,
        message: parsed.data.mode === "decision" ? "Decisión registrada." : "Envío de propuesta registrado.",
      }
    : { ok: false, error: result.error };
}

export async function requestRumboHandoffAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, db } = await requireOrgContext();
  const parsed = rumboHandoffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el formulario." };
  }
  const result = await requestRumboHandoff(db, org, user.id, {
    opportunityId: parsed.data.id,
    projectName: parsed.data.projectName,
    startDate: parsed.data.startDate ?? null,
    scopeSummary: parsed.data.scopeSummary ?? null,
    responsibleUserId: parsed.data.responsibleUserId ?? null,
  });
  revalidateOpportunity(parsed.data.id);
  if (!result.ok) return { ok: false, error: result.error };
  return result.value.status === "sent"
    ? { ok: true, message: "Enviado a Rumbo. Queda pendiente de confirmación." }
    : { ok: false, error: "El envío a Rumbo falló; revisa el estado y reintenta." };
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
