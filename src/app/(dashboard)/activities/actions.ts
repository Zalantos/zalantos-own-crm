"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant";
import { activityCreateSchema, activityUpdateSchema } from "@/lib/zod/activity";
import { handleMutationError } from "@/lib/prisma-errors";
import { appendTimelineEvent } from "@/lib/timeline";
import { evaluateWorkflows } from "@/lib/workflows/engine";
import {
  ACTIVITY_STATUS_LABELS,
  isActivityStatus,
  type ActivityStatus,
} from "@/lib/activity-status";

function parentPath(entity: {
  companyId?: string | null;
  personId?: string | null;
  opportunityId?: string | null;
}) {
  if (entity.opportunityId) return `/opportunities/${entity.opportunityId}`;
  if (entity.personId) return `/people/${entity.personId}`;
  if (entity.companyId) return `/companies/${entity.companyId}`;
  return "/activities";
}

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

  const linkedCompanyId =
    parsed.data.companyId ??
    (parsed.data.opportunityId
      ? await db.opportunity.findUnique({
          where: { id: parsed.data.opportunityId },
          select: { companyId: true },
        })
      : parsed.data.personId
        ? await db.person.findUnique({
            where: { id: parsed.data.personId },
            select: { companyId: true },
          })
        : null
    )?.companyId ??
    null;

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
  options?: { completedById?: string | null },
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
