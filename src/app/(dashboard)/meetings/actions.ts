"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleMutationError } from "@/lib/prisma-errors";
import { meetingCreateSchema, parseParticipants } from "@/lib/zod/meeting";
import { appendTimelineEvent } from "@/lib/timeline";
import type { FormState } from "./types";

export async function createMeeting(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = meetingCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { participants, ...data } = parsed.data;
  const meeting = await prisma.meeting.create({
    data: {
      ...data,
      participants: parseParticipants(participants) as Prisma.InputJsonValue,
      createdBy: user.id,
    },
  });

  await appendTimelineEvent(prisma, {
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

export async function deleteMeeting(id: string) {
  const user = await requireUser();
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { companyId: true, opportunityId: true, title: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.meeting.delete({ where: { id } });
      if (meeting) {
        await appendTimelineEvent(tx, {
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
