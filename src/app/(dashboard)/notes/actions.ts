"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant";
import { noteCreateSchema, noteUpdateSchema } from "@/lib/zod/note";
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
  return "/companies";
}

export type NoteFormState = { error: string } | undefined;

export async function createNote(
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = noteCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "La nota no pudo guardarse. Revisa los campos." };
  }

  const note = await db.note.create({
    data: { ...parsed.data, organizationId: org.id },
  });
  if (note.companyId) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: note.companyId,
      opportunityId: note.opportunityId,
      type: "note_added",
      title: note.title ? `Nota: ${note.title}` : "Nota agregada",
      summary: note.body.length > 200 ? `${note.body.slice(0, 200)}…` : note.body,
      actorId: user.id,
    });
  }
  revalidatePath(parentPath(note));
}

export async function updateNote(
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const { db } = await requireOrgContext();

  const parsed = noteUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "La nota no pudo actualizarse." };
  }

  const { id, ...data } = parsed.data;
  let note;
  try {
    note = await db.note.update({ where: { id }, data });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(note));
}

export async function deleteNote(id: string) {
  const { db } = await requireOrgContext();
  let note;
  try {
    note = await db.note.delete({ where: { id } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(note));
}
