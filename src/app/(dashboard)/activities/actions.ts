"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant";
import {
  activityCreateSchema,
  activityUpdateSchema,
} from "@/lib/zod/activity";
import { handleMutationError } from "@/lib/prisma-errors";
import { appendTimelineEvent } from "@/lib/timeline";

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
    (
      parsed.data.opportunityId
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

export async function completeActivity(id: string) {
  const { db } = await requireOrgContext();
  let activity;
  try {
    activity = await db.activity.update({
      where: { id },
      data: { status: "completed", completedAt: new Date() },
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
  revalidatePath("/dashboard");
}

export async function reopenActivity(id: string) {
  const { db } = await requireOrgContext();
  let activity;
  try {
    activity = await db.activity.update({
      where: { id },
      data: { status: "pending", completedAt: null },
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
  revalidatePath("/dashboard");
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
