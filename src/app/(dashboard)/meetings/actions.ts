"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import { handleMutationError } from "@/lib/prisma-errors";
import {
  meetingCreateSchema,
  meetingUpdateSchema,
  parseParticipants,
} from "@/lib/zod/meeting";
import { appendTimelineEvent } from "@/lib/timeline";
import type { FormState } from "./types";

export async function createMeeting(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = meetingCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { participants, ...data } = parsed.data;
  // La empresa debe pertenecer a la org.
  const company = await db.company.findUnique({
    where: { id: data.companyId },
    select: { id: true },
  });
  if (!company) {
    return { error: "La empresa seleccionada no existe." };
  }
  const meeting = await db.meeting.create({
    data: {
      ...data,
      organizationId: org.id,
      participants: parseParticipants(participants) as Prisma.InputJsonValue,
      createdBy: user.id,
    },
  });

  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: meeting.companyId,
    opportunityId: meeting.opportunityId,
    type: "meeting_created",
    title: `Reunión: ${meeting.title}`,
    refType: "meeting",
    refId: meeting.id,
    actorId: user.id,
  });

  revalidatePath("/meetings");
  redirect(`/meetings/${meeting.id}`);
}

export async function updateMeeting(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = meetingUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, participants, ...data } = parsed.data;
  let meeting;
  try {
    meeting = await db.meeting.update({
      where: { id },
      data: {
        ...data,
        ...(participants !== undefined
          ? {
              participants: parseParticipants(
                participants,
              ) as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
  } catch (error) {
    handleMutationError(error);
  }

  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: meeting.companyId,
    opportunityId: meeting.opportunityId,
    type: "meeting_updated",
    title: `Reunión actualizada: ${meeting.title}`,
    refType: "meeting",
    refId: meeting.id,
    actorId: user.id,
  });

  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meeting.id}`);
  redirect(`/meetings/${meeting.id}`);
}

export async function deleteMeeting(id: string) {
  const { user, org, db } = await requireOrgContext();
  try {
    const meeting = await db.meeting.findUnique({
      where: { id },
      select: { companyId: true, opportunityId: true, title: true },
    });
    await withOrgTransaction(org.id, async (tx) => {
      await tx.meeting.delete({ where: { id, organizationId: org.id } });
      if (meeting) {
        await appendTimelineEvent(tx, {
          organizationId: org.id,
          companyId: meeting.companyId,
          opportunityId: meeting.opportunityId,
          type: "meeting_deleted",
          title: `Reunión eliminada: ${meeting.title}`,
          refType: "meeting",
          refId: id,
          actorId: user.id,
        });
      }
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/meetings");
  redirect("/meetings");
}
