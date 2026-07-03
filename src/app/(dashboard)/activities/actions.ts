"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { activityCreateSchema } from "@/lib/zod/activity";
import { handleMutationError } from "@/lib/prisma-errors";
import { appendTimelineEvent } from "@/lib/timeline";

function parentPath(entity: {
  companyId?: string | null;
  personId?: string | null;
  opportunityId?: string | null;
}) {
  if (entity.companyId) return `/companies/${entity.companyId}`;
  if (entity.personId) return `/people/${entity.personId}`;
  if (entity.opportunityId) return `/opportunities/${entity.opportunityId}`;
  return "/activities";
}

export type ActivityFormState = { error: string } | undefined;

export async function createActivity(
  _prevState: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const user = await requireUser();

  const parsed = activityCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "La actividad no pudo guardarse. Revisa los campos." };
  }

  const activity = await prisma.activity.create({ data: parsed.data });
  if (activity.companyId) {
    await appendTimelineEvent(prisma, {
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
}

export async function completeActivity(id: string) {
  await requireUser();
  let activity;
  try {
    activity = await prisma.activity.update({
      where: { id },
      data: { status: "completed", completedAt: new Date() },
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
}

export async function reopenActivity(id: string) {
  await requireUser();
  let activity;
  try {
    activity = await prisma.activity.update({
      where: { id },
      data: { status: "pending", completedAt: null },
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
}

export async function deleteActivity(id: string) {
  await requireUser();
  let activity;
  try {
    activity = await prisma.activity.delete({ where: { id } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(activity));
  revalidatePath("/activities");
}
