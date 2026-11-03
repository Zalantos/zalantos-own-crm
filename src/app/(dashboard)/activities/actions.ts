"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant";
import {
  activityCreateSchema,
  activityUpdateSchema,
  interactionLogSchema,
} from "@/lib/zod/activity";
import { handleMutationError } from "@/lib/prisma-errors";
import { withOrgTransaction } from "@/lib/tenant";
import { insertLoggedActivity } from "@/lib/crm/activity-records";
import { recordParentPath, resolveRecordLinks } from "@/lib/commercial/links";
import { changeLeadStatusTx } from "@/lib/commercial/leads";
import { appendTimelineEvent } from "@/lib/timeline";
import { evaluateWorkflows } from "@/lib/workflows/engine";
import {
  ACTIVITY_STATUS_LABELS,
  isActivityStatus,
  type ActivityStatus,
} from "@/lib/activity-status";

const parentPath = recordParentPath;

export type ActivityFormState = { error: string } | undefined;

export async function createActivity(
  _prevState: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = activityCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "La actividad no pudo guardarse. Revisa los campos." };
  }

  const links = await resolveRecordLinks(db, parsed.data);
  if (!links.ok) return { error: links.error };
  const linkedCompanyId = links.companyId;
  if (parsed.data.assigneeId) {
    const member = await db.teamMember.findUnique({
      where: { id: parsed.data.assigneeId },
      select: { id: true },
    });
    if (!member) return { error: "El responsable seleccionado no existe." };
  }

  const activity = await db.activity.create({
    data: {
      ...parsed.data,
      companyId: linkedCompanyId,
      organizationId: org.id,
      createdById: user.id,
      createdVia: "manual",
    },
  });
  if (activity.companyId) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: activity.companyId,
      opportunityId: activity.opportunityId,
      refType: activity.commercialLeadId ? "commercial_lead" : "activity",
      refId: activity.commercialLeadId ?? activity.id,
      type: "task_created",
      title: `Tarea creada: ${activity.title}`,
      summary: activity.dueDate
        ? `Vence ${activity.dueDate.toLocaleDateString("es-AR")}`
        : undefined,
      actorId: user.id,
    });
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
  revalidatePath("/dashboard");
}

export async function updateActivity(
  _prevState: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const { db } = await requireOrgContext();

  const parsed = activityUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "La actividad no pudo actualizarse." };
  }

  const { id, ...data } = parsed.data;
  const links = await resolveRecordLinks(db, data);
  if (!links.ok) return { error: links.error };
  let activity;
  try {
    activity = await db.activity.update({ where: { id }, data });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
  revalidatePath("/dashboard");
}

export async function assignActivity(id: string, assigneeId: string | null) {
  const { user, org, db } = await requireOrgContext();
  let activity;
  try {
    activity = await db.activity.update({
      where: { id },
      data: { assigneeId },
      include: { assignee: { select: { name: true } } },
    });
  } catch (error) {
    handleMutationError(error);
  }
  if (activity.companyId) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: activity.companyId,
      opportunityId: activity.opportunityId,
      type: "task_assigned",
      title: `Tarea reasignada: ${activity.title}`,
      summary: activity.assignee
        ? `Asignada a ${activity.assignee.name}`
        : "Sin responsable",
      refType: "activity",
      refId: activity.id,
      actorId: user.id,
    });
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
  revalidatePath("/dashboard");
}

export async function updateActivityStatus(
  id: string,
  status: ActivityStatus,
  options?: { completedById?: string | null; outcomes?: string | null },
) {
  const { user, org, db } = await requireOrgContext();

  const before = await db.activity.findUnique({ where: { id } });
  if (!before) return;

  const data: {
    status: ActivityStatus;
    statusChangedAt: Date;
    completedAt?: Date | null;
    completedById?: string | null;
    blockedReason?: string | null;
    outcomes?: string | null;
  } = {
    status,
    statusChangedAt: new Date(),
  };

  if (status === "done" && before.status !== "done") {
    data.completedAt = new Date();
    data.completedById = options?.completedById ?? before.assigneeId ?? null;
  } else if (before.status === "done" && status !== "done") {
    data.completedAt = null;
    data.completedById = null;
  } else if (options && "completedById" in options) {
    data.completedById = options.completedById ?? null;
  }

  if (status !== "blocked") {
    data.blockedReason = null;
  }
  // Resultado al completar (se guarda en outcomes, igual que las
  // actividades registradas).
  if (status === "done" && options?.outcomes?.trim()) {
    data.outcomes = options.outcomes.trim();
  }

  let activity;
  try {
    activity = await db.activity.update({ where: { id }, data });
  } catch (error) {
    handleMutationError(error);
  }

  const beforeLabel = isActivityStatus(before.status)
    ? ACTIVITY_STATUS_LABELS[before.status]
    : before.status;

  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: activity.companyId,
    opportunityId: activity.opportunityId,
    type: "task_status_changed",
    title: `Tarea "${activity.title}"`,
    summary: `${beforeLabel} → ${ACTIVITY_STATUS_LABELS[status]}`,
    refType: "activity",
    refId: activity.id,
    actorId: user.id,
  });

  await evaluateWorkflows(db, org.id, {
    entityType: "activity",
    entityId: activity.id,
    eventName: "status_changed",
    actorId: user.id,
    before: { status: before.status },
    after: { status: activity.status },
  });

  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
  revalidatePath("/dashboard");
}

export async function completeActivity(id: string) {
  await updateActivityStatus(id, "done");
}

export async function reopenActivity(id: string) {
  await updateActivityStatus(id, "todo");
}

export async function deleteActivity(id: string) {
  const { db } = await requireOrgContext();
  let activity;
  try {
    activity = await db.activity.delete({ where: { id } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
  revalidatePath("/dashboard");
}

export async function completeTaskWithOutcome(id: string, outcomes: string) {
  await updateActivityStatus(id, "done", { outcomes });
}

export type InteractionFormState =
  | { error: string }
  | { success: true; message: string }
  | undefined;

// Registro manual de una interacción ocurrida (omnicanal). Opcionalmente
// marca al prospecto como contactado, en la misma transacción.
export async function logInteraction(
  _prevState: InteractionFormState,
  formData: FormData,
): Promise<InteractionFormState> {
  const { user, org, db } = await requireOrgContext();
  const parsed = interactionLogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los campos de la interacción.",
    };
  }
  const input = parsed.data;
  const links = await resolveRecordLinks(db, input);
  if (!links.ok) return { error: links.error };

  try {
    await withOrgTransaction(org.id, async (tx) => {
      await insertLoggedActivity(
        tx,
        { organizationId: org.id, actorId: user.id, createdVia: "manual" },
        {
          companyId: links.companyId,
          opportunityId: input.opportunityId ?? null,
          commercialLeadId: input.commercialLeadId ?? null,
          commercialPartnerId: input.commercialPartnerId ?? null,
          personIds: input.personId ? [input.personId] : [],
          type: input.type,
          title: input.title,
          occurredAt: input.occurredAt,
          durationMinutes: input.durationMinutes ?? null,
          channel: null,
          summary: input.description ?? null,
          outcomes: input.outcomes ?? null,
        },
      );
      if (input.commercialLeadId && input.markContacted) {
        const lead = await tx.commercialLead.findFirst({
          where: { id: input.commercialLeadId, organizationId: org.id },
          select: { status: true },
        });
        if (lead?.status === "prospect") {
          await changeLeadStatusTx(
            tx,
            { organizationId: org.id, actorId: user.id, createdVia: "manual" },
            input.commercialLeadId,
            { status: "contacted", at: input.occurredAt },
          );
        }
      }
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la interacción." };
  }
  revalidatePath(parentPath(input));
  revalidatePath("/activities");
  revalidatePath("/prospecting");
  return { success: true, message: "Interacción registrada." };
}
