"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import { personCreateSchema, personUpdateSchema } from "@/lib/zod/person";
import {
  deleteCustomFieldValues,
  upsertCustomFieldValues,
} from "@/lib/custom-fields/merge";
import { handleMutationError } from "@/lib/prisma-errors";

export type FormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;

export async function createPerson(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { org, db } = await requireOrgContext();

  const parsed = personCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const person = await db.person.create({
    data: { ...parsed.data, organizationId: org.id },
  });
  await upsertCustomFieldValues(db, org.id, "person", person.id, formData);
  revalidatePath("/people");
  if (person.companyId) revalidatePath(`/companies/${person.companyId}`);
  redirect(`/people/${person.id}`);
}

export async function updatePerson(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { org, db } = await requireOrgContext();

  const parsed = personUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, ...data } = parsed.data;
  let person;
  try {
    person = await db.person.update({ where: { id }, data });
  } catch (error) {
    handleMutationError(error);
  }
  await upsertCustomFieldValues(db, org.id, "person", id, formData);
  revalidatePath("/people");
  revalidatePath(`/people/${id}`);
  if (person.companyId) revalidatePath(`/companies/${person.companyId}`);
  redirect(`/people/${id}`);
}

export async function deletePerson(id: string) {
  const { org } = await requireOrgContext();
  let person;
  try {
    person = await withOrgTransaction(org.id, async (tx) => {
      await deleteCustomFieldValues(tx, org.id, "person", id);
      return tx.person.delete({ where: { id, organizationId: org.id } });
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/people");
  if (person.companyId) revalidatePath(`/companies/${person.companyId}`);
  redirect("/people");
}
