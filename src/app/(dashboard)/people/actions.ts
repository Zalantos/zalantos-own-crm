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
import { personCompanyRelationshipsSchema } from "@/lib/zod/person-company";
import type { z } from "zod";

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

type RelationshipInput = z.infer<
  typeof personCompanyRelationshipsSchema
>[number];

function parseRelationships(
  formData: FormData,
  fallback: { companyId?: string; roleTitle?: string },
):
  | { success: true; data: RelationshipInput[] }
  | { success: false; error: string } {
  const raw = formData.get("relationshipsJson");
  let candidate: unknown;
  try {
    candidate = raw
      ? JSON.parse(String(raw))
      : fallback.companyId
        ? [
            {
              companyId: fallback.companyId,
              roles: ["contact"],
              roleTitle: fallback.roleTitle || null,
              isPrimary: true,
            },
          ]
        : [];
  } catch {
    return {
      success: false,
      error: "Las relaciones con empresas no son válidas.",
    };
  }
  const parsed = personCompanyRelationshipsSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? "Revisa las empresas relacionadas.",
    };
  }
  return { success: true, data: parsed.data };
}

async function assertRelationshipCompanies(
  db: Awaited<ReturnType<typeof requireOrgContext>>["db"],
  relationships: RelationshipInput[],
) {
  if (relationships.length === 0) return true;
  const count = await db.company.count({
    where: {
      id: { in: relationships.map((relationship) => relationship.companyId) },
    },
  });
  return count === relationships.length;
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

  const relationships = parseRelationships(formData, parsed.data);
  if (!relationships.success) return { error: relationships.error };
  if (!(await assertRelationshipCompanies(db, relationships.data))) {
    return { error: "Una de las empresas seleccionadas no existe." };
  }
  const primary = relationships.data.find(
    (relationship) => relationship.isPrimary,
  );

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
    person = await withOrgTransaction(org.id, async (tx) => {
      const created = await tx.person.create({
        data: {
          ...parsed.data,
          companyId: primary?.companyId ?? null,
          roleTitle: primary?.roleTitle ?? null,
          organizationId: org.id,
          createdById: user.id,
          createdVia: "manual",
        },
      });
      for (const relationship of relationships.data) {
        await tx.personCompanyRelationship.create({
          data: {
            organizationId: org.id,
            personId: created.id,
            ...relationship,
          },
        });
      }
      return created;
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
  for (const relationship of relationships.data) {
    revalidatePath(`/companies/${relationship.companyId}`);
  }
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

  const relationships = parseRelationships(formData, parsed.data);
  if (!relationships.success) return { error: relationships.error };
  if (!(await assertRelationshipCompanies(db, relationships.data))) {
    return { error: "Una de las empresas seleccionadas no existe." };
  }
  const primary = relationships.data.find(
    (relationship) => relationship.isPrimary,
  );

  const { id, ...data } = parsed.data;
  const previousRelationships = await db.personCompanyRelationship.findMany({
    where: { personId: id, endedAt: null },
    select: { companyId: true },
  });
  try {
    await withOrgTransaction(org.id, async (tx) => {
      const existing = await tx.person.findFirst({
        where: { id, organizationId: org.id },
        select: { id: true },
      });
      if (!existing) throw new Error("La persona no existe.");
      await tx.personCompanyRelationship.updateMany({
        where: { personId: id, organizationId: org.id },
        data: { isPrimary: false },
      });
      const updated = await tx.person.update({
        where: { id, organizationId: org.id },
        data: {
          ...data,
          companyId: primary?.companyId ?? null,
          roleTitle: primary?.roleTitle ?? null,
        },
      });
      const activeCompanyIds = relationships.data.map(
        (relationship) => relationship.companyId,
      );
      await tx.personCompanyRelationship.updateMany({
        where: {
          personId: id,
          organizationId: org.id,
          companyId: { notIn: activeCompanyIds },
          endedAt: null,
        },
        data: { endedAt: new Date(), isPrimary: false },
      });
      for (const relationship of relationships.data) {
        await tx.personCompanyRelationship.upsert({
          where: {
            personId_companyId: {
              personId: id,
              companyId: relationship.companyId,
            },
          },
          create: {
            organizationId: org.id,
            personId: id,
            ...relationship,
          },
          update: {
            roles: relationship.roles,
            roleTitle: relationship.roleTitle,
            isPrimary: relationship.isPrimary,
            startedAt: relationship.startedAt,
            endedAt: relationship.endedAt ?? null,
            notes: relationship.notes,
          },
        });
      }
      return updated;
    });
  } catch (error) {
    handleMutationError(error);
  }
  await upsertCustomFieldValues(db, org.id, "person", id, formData);
  revalidatePath("/people");
  revalidatePath(`/people/${id}`);
  for (const companyId of new Set([
    ...previousRelationships.map((relationship) => relationship.companyId),
    ...relationships.data.map((relationship) => relationship.companyId),
  ])) {
    revalidatePath(`/companies/${companyId}`);
  }
  redirect(`/people/${id}`);
}

export async function deletePerson(id: string) {
  const { org, db } = await requireOrgContext();

  const existingPerson = await db.person.findUnique({
    where: { id },
    include: {
      companyRelationships: { select: { companyId: true } },
    },
  });
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
  for (const companyId of new Set([
    ...(person.companyId ? [person.companyId] : []),
    ...existingPerson.companyRelationships.map(
      (relationship) => relationship.companyId,
    ),
  ])) {
    revalidatePath(`/companies/${companyId}`);
  }
  redirect("/people");
}

export async function linkPersonToCompany(formData: FormData) {
  const { org, db } = await requireOrgContext();
  const personId = String(formData.get("personId") ?? "");
  const companyId = String(formData.get("companyId") ?? "");
  const roleTitle = String(formData.get("roleTitle") ?? "").trim() || null;
  const roles = String(formData.get("roles") ?? "contact")
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
  if (!personId || !companyId || roles.length === 0) {
    throw new Error("Selecciona una persona e indica al menos un rol.");
  }
  const [person, company] = await Promise.all([
    db.person.findUnique({
      where: { id: personId },
      select: {
        id: true,
        companyId: true,
        companyRelationships: {
          where: { isPrimary: true, endedAt: null },
          take: 1,
          select: { id: true },
        },
      },
    }),
    db.company.findUnique({ where: { id: companyId }, select: { id: true } }),
  ]);
  if (!person || !company) throw new Error("La persona o empresa no existe.");
  const shouldBePrimary = person.companyRelationships.length === 0;

  await withOrgTransaction(org.id, async (tx) => {
    await tx.personCompanyRelationship.upsert({
      where: { personId_companyId: { personId, companyId } },
      create: {
        organizationId: org.id,
        personId,
        companyId,
        roles: [...new Set(roles)],
        roleTitle,
        isPrimary: shouldBePrimary,
      },
      update: {
        roles: [...new Set(roles)],
        roleTitle,
        endedAt: null,
      },
    });
    if (shouldBePrimary) {
      await tx.person.update({
        where: { id: personId, organizationId: org.id },
        data: { companyId, roleTitle },
      });
    }
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
}
