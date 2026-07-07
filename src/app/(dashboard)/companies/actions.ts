"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { companyCreateSchema, companyUpdateSchema } from "@/lib/zod/company";
import {
  deleteCustomFieldValues,
  upsertCustomFieldValues,
} from "@/lib/custom-fields/merge";
import { handleMutationError } from "@/lib/prisma-errors";

export type FormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;

export async function createCompany(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = companyCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const company = await prisma.company.create({
    data: { ...parsed.data, createdById: user.id },
  });
  await upsertCustomFieldValues("company", company.id, formData);
  revalidatePath("/companies");
  redirect(`/companies/${company.id}`);
}

export async function updateCompany(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();

  const parsed = companyUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, ...data } = parsed.data;
  try {
    await prisma.company.update({ where: { id }, data });
  } catch (error) {
    handleMutationError(error);
  }
  await upsertCustomFieldValues("company", id, formData);
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  redirect(`/companies/${id}`);
}

export async function deleteCompany(id: string) {
  const user = await requireUser();
  const company = await prisma.company.findUnique({
    where: { id },
    select: { createdById: true },
  });

  if (!company) {
    revalidatePath("/companies");
    redirect("/companies");
  }

  if (user.role !== "ADMIN" && company.createdById !== user.id) {
    throw new Error("No tienes permiso para eliminar esta empresa.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const opportunities = await tx.opportunity.findMany({
        where: { companyId: id },
        select: { id: true },
      });

      await deleteCustomFieldValues(tx, "company", id);
      if (opportunities.length > 0) {
        await deleteCustomFieldValues(
          tx,
          "opportunity",
          opportunities.map((opportunity) => opportunity.id),
        );
      }

      // Opportunities (and their activities/notes via SET NULL) cascade at
      // the DB level once the company row is removed.
      await tx.company.delete({ where: { id } });
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/companies");
  redirect("/companies");
}
