"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import { personCreateSchema, personUpdateSchema } from "@/lib/zod/person";
import {
  findExistingPerson,
  type ExistingPersonMatch,
} from "@/lib/crm/person-dedup";
import {
  deleteCustomFieldValues,
  upsertCustomFieldValues,
} from "@/lib/custom-fields/merge";
import { handleMutationError } from "@/lib/prisma-errors";

export type FormState =
  | {
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
      conflict?: {
        kind: "email" | "name";
        personId: string;
        name: string;
        email: string | null;
        companyName: string | null;
        href: string;
      };
    }
  | undefined;

function conflictState(
  match: ExistingPersonMatch,
  requestedCompanyId: string | undefined,
): Exclude<FormState, undefined> {
  const name = `${match.firstName} ${match.lastName}`.trim();
  const conflict = {
    kind: match.matchedBy,
    personId: match.id,
    name,
    email: match.email,
    companyName: match.companyName,
    href: `/people/${match.id}`,
  } as const;

  if (match.matchedBy === "name") {
    return {
      error: `Ya existe ${name} en esta empresa.`,
      conflict,
    };
  }

  const email = match.email ? ` (${match.email})` : "";
  const companySuffix =
    match.companyId === requestedCompanyId
      ? ""
      : match.companyName
        ? ` en ${match.companyName}`
        : " sin empresa";
  return {
    error: `Ya existe ${name}${email}${companySuffix}.`,
    conflict,
  };
}

export async function createPerson(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = personCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existing = await findExistingPerson(db, org.id, parsed.data);
  const confirmedNameMatch = formData.get("confirmNameMatch");
  if (
    existing &&
    (existing.matchedBy === "email" || confirmedNameMatch !== existing.id)
  ) {
    return conflictState(existing, parsed.data.companyId);
  }

  let person;
  try {
    person = await db.person.create({
      data: {
        ...parsed.data,
        organizationId: org.id,
        createdById: user.id,
        createdVia: "manual",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      parsed.data.email
    ) {
      const concurrentMatch = await findExistingPerson(db, org.id, {
        email: parsed.data.email,
      });
      if (concurrentMatch) {
        return conflictState(concurrentMatch, parsed.data.companyId);
      }
    }
    handleMutationError(error);
  }

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
  const { org, db } = await requireOrgContext();

  const existingPerson = await db.person.findUnique({ where: { id } });
  if (!existingPerson) {
    revalidatePath("/people");
    redirect("/people");
  }

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
