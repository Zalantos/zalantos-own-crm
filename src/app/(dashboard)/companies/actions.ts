"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
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
  const { user, org, db } = await requireOrgContext();

  const parsed = companyCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const company = await db.company.create({
    data: { ...parsed.data, organizationId: org.id, createdById: user.id },
  });
  await upsertCustomFieldValues(db, org.id, "company", company.id, formData);
  revalidatePath("/companies");
  redirect(`/companies/${company.id}`);
}

export async function updateCompany(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { org, db } = await requireOrgContext();

  const parsed = companyUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, ...data } = parsed.data;
  try {
    await db.company.update({ where: { id }, data });
  } catch (error) {
    handleMutationError(error);
  }
  await upsertCustomFieldValues(db, org.id, "company", id, formData);
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  redirect(`/companies/${id}`);
}

export async function deleteCompany(id: string) {
  const { user, org, db } = await requireOrgContext();
  const company = await db.company.findUnique({
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
    await withOrgTransaction(org.id, async (tx) => {
      const opportunities = await tx.opportunity.findMany({
        where: { companyId: id, organizationId: org.id },
        select: { id: true },
      });

      await deleteCustomFieldValues(tx, org.id, "company", id);
      if (opportunities.length > 0) {
        await deleteCustomFieldValues(
          tx,
          org.id,
          "opportunity",
          opportunities.map((opportunity) => opportunity.id),
        );
      }

      // Opportunities (and their activities/notes via SET NULL) cascade at
      // the DB level once the company row is removed.
      await tx.company.delete({ where: { id, organizationId: org.id } });
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/companies");
  redirect("/companies");
}
