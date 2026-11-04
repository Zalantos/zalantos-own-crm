"use server";

import { Prisma, type Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import { companyCreateSchema, companyUpdateSchema } from "@/lib/zod/company";
import {
  deleteCustomFieldValues,
  upsertCustomFieldValues,
} from "@/lib/custom-fields/merge";
import { handleMutationError } from "@/lib/prisma-errors";
import { isWikiEnabledForOrg } from "@/lib/wiki-mcp/authorization";

export type FormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;

const DUPLICATE_WIKI_CLIENT: FormState = {
  error: "Revisa los campos del formulario.",
  fieldErrors: {
    wikiClientId: ["Este ID de cliente ya está vinculado a otra empresa."],
  },
};

function isDuplicateWikiClient(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("wikiClientId")
  );
}

// El vínculo decide qué documentos se atribuyen a la empresa: solo lo edita un
// admin de una organización con la Wiki habilitada, y nunca el agente (no está en
// field-registry). Lo enviado por otro usuario se ignora.
function wikiClientIdUpdate(
  value: string | null | undefined,
  role: Role,
  organizationId: string,
) {
  if (value === undefined) return {};
  if (role !== "ADMIN" || !isWikiEnabledForOrg(organizationId)) return {};
  return { wikiClientId: value };
}

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

  const { wikiClientId, ...data } = parsed.data;
  let companyId: string;
  try {
    const company = await db.company.create({
      data: {
        ...data,
        ...wikiClientIdUpdate(wikiClientId, user.role, org.id),
        organizationId: org.id,
        createdById: user.id,
        createdVia: "manual",
      },
    });
    companyId = company.id;
  } catch (error) {
    if (isDuplicateWikiClient(error)) return DUPLICATE_WIKI_CLIENT;
    throw error;
  }
  await upsertCustomFieldValues(db, org.id, "company", companyId, formData);
  revalidatePath("/companies");
  redirect(`/companies/${companyId}`);
}

export async function updateCompany(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = companyUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, wikiClientId, ...data } = parsed.data;
  try {
    await db.company.update({
      where: { id },
      data: {
        ...data,
        ...wikiClientIdUpdate(wikiClientId, user.role, org.id),
      },
    });
  } catch (error) {
    if (isDuplicateWikiClient(error)) return DUPLICATE_WIKI_CLIENT;
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
