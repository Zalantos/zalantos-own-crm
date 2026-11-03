"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenant";
import { commercialPartnerSchema } from "@/lib/zod/commercial";
import {
  ALLIANCE_STAGES,
  ALLIANCE_STATUSES,
  ALLIANCE_TYPES,
} from "@/lib/commercial/partners";
import { changeAlliance } from "@/lib/commercial/partner-service";
import { recordStatusChange } from "@/lib/commercial/history";
import { withOrgTransaction } from "@/lib/tenant";

export type PartnerFormState = { error: string } | { ok: true; message: string } | undefined;

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().optional());

const allianceFieldsSchema = z.object({
  allianceType: z.preprocess(emptyToUndefined, z.enum(ALLIANCE_TYPES).optional()),
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

// Alta de un partner directamente en el pipeline de alianzas (Identificado).
// Reutiliza el catálogo CommercialPartner: no hay partners paralelos.
export async function createAlliancePartner(
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const { user, org, db } = await requireOrgContext();
  const raw = Object.fromEntries(formData);
  const partner = commercialPartnerSchema.safeParse(raw);
  const fields = allianceFieldsSchema.safeParse(raw);
  if (!partner.success) return { error: partner.error.issues[0]?.message ?? "Revisa el partner." };
  if (!fields.success) return { error: "Revisa los datos de la alianza." };
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
  if (existing) return { error: "Ya existe un partner con ese nombre: ábrelo desde Alianzas." };

  const id = await withOrgTransaction(org.id, async (tx) => {
    const now = new Date();
    const created = await tx.commercialPartner.create({
      data: {
        ...partner.data,
        ...fields.data,
        ownerId: fields.data.ownerId ?? user.id,
        organizationId: org.id,
        allianceStage: "identified",
        allianceStageChangedAt: now,
      },
      select: { id: true },
    });
    await recordStatusChange(tx, {
      organizationId: org.id,
      entityType: "commercial_partner",
      entityId: created.id,
      field: "alliance_stage",
      fromValue: null,
      toValue: "identified",
      actorId: user.id,
      source: "manual",
      at: now,
    });
    return created.id;
  });
  revalidatePartner();
  redirect(`/partners/${id}`);
}

export async function updateAllianceFields(
  partnerId: string,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const { user, db } = await requireOrgContext();
  const parsed = allianceFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los datos de la alianza." };
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
  return { ok: true, message: "Alianza actualizada." };
}

const allianceChangeSchema = z.object({
  stage: z.preprocess(emptyToUndefined, z.enum(ALLIANCE_STAGES).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(ALLIANCE_STATUSES).optional()),
  reason: optionalText,
});

export async function changeAllianceAction(
  partnerId: string,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const { user, org, db } = await requireOrgContext();
  const parsed = allianceChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || (!parsed.data.stage && !parsed.data.status)) {
    return { error: "Indica la etapa o el estado." };
  }
  const result = await changeAlliance(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    partnerId,
    parsed.data,
  );
  revalidatePartner(partnerId);
  return result.ok ? { ok: true, message: "Alianza actualizada." } : { error: result.error };
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
    return { error: "Esa persona ya es contacto de la alianza." };
  }
  revalidatePartner(partnerId);
  return { ok: true, message: "Contacto agregado." };
}

export async function removePartnerContact(partnerId: string, contactId: string) {
  const { db } = await requireOrgContext();
  await db.commercialPartnerContact.deleteMany({ where: { id: contactId, commercialPartnerId: partnerId } });
  revalidatePartner(partnerId);
}
