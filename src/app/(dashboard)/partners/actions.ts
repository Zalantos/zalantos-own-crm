"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenant";
import { commercialPartnerSchema } from "@/lib/zod/commercial";
import { PARTNER_TYPES } from "@/lib/commercial/partners";

export type PartnerFormState = { error: string } | { ok: true; message: string } | undefined;

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().optional());

const partnerFieldsSchema = z.object({
  allianceType: z.preprocess(emptyToUndefined, z.enum(PARTNER_TYPES).optional()),
  ownerId: optionalText,
  commercialPotential: optionalText,
  potentialValue: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  agreementTerms: optionalText,
  agreementSignedAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
});

function revalidatePartner(id?: string) {
  revalidatePath("/partners");
  if (id) revalidatePath(`/partners/${id}`);
}

async function assertOwner(
  db: Awaited<ReturnType<typeof requireOrgContext>>["db"],
  ownerId: string | undefined,
) {
  if (!ownerId) return true;
  const owner = await db.user.findFirst({ where: { id: ownerId, isActive: true }, select: { id: true } });
  return Boolean(owner);
}

export async function createPartner(
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const { user, org, db } = await requireOrgContext();
  const raw = Object.fromEntries(formData);
  const partner = commercialPartnerSchema.safeParse(raw);
  const fields = partnerFieldsSchema.safeParse(raw);
  if (!partner.success) return { error: partner.error.issues[0]?.message ?? "Revisa el partner." };
  if (!fields.success) return { error: "Revisa los datos del partner." };
  if (partner.data.linkedCompanyId) {
    const company = await db.company.findUnique({ where: { id: partner.data.linkedCompanyId }, select: { id: true } });
    if (!company) return { error: "La empresa vinculada no existe." };
  }
  if (partner.data.linkedPersonId) {
    const person = await db.person.findUnique({ where: { id: partner.data.linkedPersonId }, select: { id: true } });
    if (!person) return { error: "La persona vinculada no existe." };
  }
  if (!(await assertOwner(db, fields.data.ownerId ?? user.id))) {
    return { error: "El responsable no es válido." };
  }
  const existing = await db.commercialPartner.findFirst({
    where: { displayName: { equals: partner.data.displayName, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { error: "Ya existe un partner con ese nombre: ábrelo desde el directorio." };

  const created = await db.commercialPartner.create({
    data: {
      ...partner.data,
      ...fields.data,
      ownerId: fields.data.ownerId ?? user.id,
      organizationId: org.id,
    },
    select: { id: true },
  });
  revalidatePartner();
  redirect(`/partners/${created.id}`);
}

export async function updatePartnerFields(
  partnerId: string,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const { user, db } = await requireOrgContext();
  const parsed = partnerFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los datos del partner." };
  if (!(await assertOwner(db, parsed.data.ownerId))) return { error: "El responsable no es válido." };
  try {
    await db.commercialPartner.update({
      where: { id: partnerId },
      data: {
        allianceType: parsed.data.allianceType ?? null,
        ownerId: parsed.data.ownerId ?? user.id,
        commercialPotential: parsed.data.commercialPotential ?? null,
        potentialValue: parsed.data.potentialValue ?? null,
        agreementTerms: parsed.data.agreementTerms ?? null,
        agreementSignedAt: parsed.data.agreementSignedAt ?? null,
      },
    });
  } catch {
    return { error: "Partner no encontrado." };
  }
  revalidatePartner(partnerId);
  return { ok: true, message: "Partner actualizado." };
}

export async function setPartnerActive(partnerId: string, isActive: boolean) {
  const { db } = await requireOrgContext();
  await db.commercialPartner.update({ where: { id: partnerId }, data: { isActive } });
  revalidatePartner(partnerId);
}

export async function addPartnerContact(
  partnerId: string,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const { org, db } = await requireOrgContext();
  const personId = String(formData.get("personId") ?? "");
  const role = String(formData.get("role") ?? "").trim() || null;
  const [partner, person] = await Promise.all([
    db.commercialPartner.findUnique({ where: { id: partnerId }, select: { id: true } }),
    personId ? db.person.findUnique({ where: { id: personId }, select: { id: true } }) : null,
  ]);
  if (!partner || !person) return { error: "Selecciona una persona válida." };
  try {
    await db.commercialPartnerContact.create({
      data: { organizationId: org.id, commercialPartnerId: partnerId, personId, role },
    });
  } catch {
    return { error: "Esa persona ya es contacto del partner." };
  }
  revalidatePartner(partnerId);
  return { ok: true, message: "Contacto agregado." };
}

export async function removePartnerContact(partnerId: string, contactId: string) {
  const { db } = await requireOrgContext();
  await db.commercialPartnerContact.deleteMany({ where: { id: contactId, commercialPartnerId: partnerId } });
  revalidatePartner(partnerId);
}
