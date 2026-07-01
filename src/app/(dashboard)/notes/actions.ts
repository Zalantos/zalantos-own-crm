"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { noteCreateSchema, noteUpdateSchema } from "@/lib/zod/note";
import { handleMutationError } from "@/lib/prisma-errors";

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
  await requireUser();

  const parsed = noteCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "La nota no pudo guardarse. Revisa los campos." };
  }

  const note = await prisma.note.create({ data: parsed.data });
  revalidatePath(parentPath(note));
}

export async function updateNote(
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  await requireUser();

  const parsed = noteUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "La nota no pudo actualizarse." };
  }

  const { id, ...data } = parsed.data;
  let note;
  try {
    note = await prisma.note.update({ where: { id }, data });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(note));
}

export async function deleteNote(id: string) {
  await requireUser();
  let note;
  try {
    note = await prisma.note.delete({ where: { id } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath(parentPath(note));
}
