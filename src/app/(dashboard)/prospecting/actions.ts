"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import {
  commercialLeadConvertSchema,
  commercialLeadCreateSchema,
  commercialLeadStatusSchema,
  commercialLeadUpdateSchema,
} from "@/lib/zod/commercial-lead";
import {
  changeLeadStatus,
  convertLeadToOpportunity,
  createCommercialLead,
} from "@/lib/commercial/leads";

export type LeadFormState =
  | { error: string; duplicateOfId?: string; fieldErrors?: Record<string, string[] | undefined> }
  | { ok: true; message: string }
  | undefined;

function revalidateLead(id?: string) {
  revalidatePath("/prospecting");
  if (id) revalidatePath(`/prospecting/${id}`);
  revalidatePath("/dashboard");
}

export async function createLeadAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const { user, org, db } = await requireOrgContext();
  const parsed = commercialLeadCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los campos.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const input = parsed.data;
  if (input.status === "contacted" && !input.contactType) {
    return { error: "Para crearlo como contactado indica el canal del primer contacto." };
  }
  const result = await createCommercialLead(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    {
      title: input.title,
      companyId: input.companyId,
      companyName: input.companyId ? null : input.companyName,
      personId: input.personId,
      person: input.personId || !input.firstName
        ? null
        : {
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            roleTitle: input.roleTitle,
            linkedinUrl: input.linkedinUrl,
          },
      status: input.status,
      ownerId: input.ownerId,
      priority: input.priority,
      description: input.description,
      interestSignal: input.interestSignal,
      attribution: {
        sourceChannel: input.sourceChannel,
        campaignId: input.campaignId,
        referrerPersonId: input.referrerPersonId,
        referrerPartnerId: input.referrerPartnerId,
        sourceDetail: input.sourceDetail,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
      },
      nextStep: input.nextStep,
      nextStepDueDate: input.nextStepDueDate,
      nextStepChannel: input.nextStepChannel,
      contactAttempt:
        input.status === "contacted" && input.contactType
          ? {
              type: input.contactType,
              occurredAt: input.contactAt ?? new Date(),
              summary: input.contactSummary,
            }
          : null,
    },
  );
  if (!result.ok) {
    return { error: result.error, duplicateOfId: "duplicateOfId" in result ? result.duplicateOfId : undefined };
  }
  revalidateLead();
  redirect(`/prospecting/${result.value.id}`);
}

export async function changeLeadStatusAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const { user, org, db } = await requireOrgContext();
  const parsed = commercialLeadStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  const { id, contactType, contactAt, contactSummary, ...input } = parsed.data;
  const result = await changeLeadStatus(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    id,
    {
      ...input,
      contactAttempt: contactType
        ? { type: contactType, occurredAt: contactAt ?? new Date(), summary: contactSummary }
        : null,
    },
  );
  revalidateLead(id);
  return result.ok ? { ok: true, message: "Estado actualizado." } : { error: result.error };
}

export async function updateLeadAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const { db } = await requireOrgContext();
  const parsed = commercialLeadUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  const { id, ...data } = parsed.data;
  if (data.ownerId) {
    const owner = await db.user.findFirst({ where: { id: data.ownerId, isActive: true }, select: { id: true } });
    if (!owner) return { error: "El responsable seleccionado no es válido." };
  }
  if (data.companyId) {
    const company = await db.company.findUnique({ where: { id: data.companyId }, select: { id: true } });
    if (!company) return { error: "La empresa no existe." };
  }
  if (data.personId) {
    const person = await db.person.findUnique({ where: { id: data.personId }, select: { id: true } });
    if (!person) return { error: "La persona no existe." };
  }
  try {
    await db.commercialLead.update({
      where: { id },
      data: {
        title: data.title,
        ownerId: data.ownerId ?? null,
        priority: data.priority ?? null,
        description: data.description ?? null,
        interestSignal: data.interestSignal ?? null,
        ...(data.companyId ? { companyId: data.companyId } : {}),
        ...(data.personId ? { personId: data.personId } : {}),
      },
    });
  } catch {
    return { error: "No se pudo guardar el prospecto." };
  }
  revalidateLead(id);
  return { ok: true, message: "Prospecto actualizado." };
}

export async function convertLeadAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const { user, org, db } = await requireOrgContext();
  const parsed = commercialLeadConvertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  const { id, ...input } = parsed.data;
  const result = await convertLeadToOpportunity(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    id,
    input,
  );
  if (!result.ok) return { error: result.error };
  revalidateLead(id);
  revalidatePath("/opportunities");
  redirect(`/opportunities/${result.value.opportunityId}`);
}
