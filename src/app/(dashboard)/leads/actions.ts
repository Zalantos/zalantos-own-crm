"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import { convertInboundLeadSchema } from "@/lib/zod/inbound-lead";
import { convertLeadTx } from "@/lib/inbound-leads/convert";
import { handleMutationError } from "@/lib/prisma-errors";

export type ConvertLeadFormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | { success: true; opportunityId: string }
  | undefined;

function revalidateLead(id: string) {
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/dashboard");
}

// Marcar revisado y descartar son acciones explícitas del usuario (abrir el
// detalle NO cambia el estado solo; ver docs/integrations/inbound-leads.md).
export async function markLeadReviewed(id: string) {
  const { user, db } = await requireOrgContext();
  let lead;
  try {
    lead = await db.inboundLead.update({
      where: { id, status: "new" },
      data: { status: "reviewed", reviewedAt: new Date(), reviewedById: user.id },
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidateLead(lead.id);
}

export async function discardLead(id: string) {
  const { user, db } = await requireOrgContext();
  let lead;
  try {
    lead = await db.inboundLead.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
    });
  } catch (error) {
    handleMutationError(error);
  }
  revalidateLead(lead.id);
}

// Conversión: Company (existente o nueva) -> Person (dedup existente) ->
// Opportunity, + Note con el mensaje original. La lógica transaccional vive
// en convertLeadTx (lib/inbound-leads/convert.ts) para poder testearla sin
// Next.js ni DB real.
export async function convertInboundLead(
  _prevState: ConvertLeadFormState,
  formData: FormData,
): Promise<ConvertLeadFormState> {
  const { user, org, db } = await requireOrgContext();

  const parsed = convertInboundLeadSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { id, companyId, companyName, opportunityName } = parsed.data;

  const lead = await db.inboundLead.findUnique({ where: { id } });
  if (!lead) notFound();
  if (lead.status === "converted") {
    return { error: "Este lead ya fue convertido." };
  }

  try {
    const result = await withOrgTransaction(org.id, (tx) =>
      convertLeadTx(
        tx,
        { organizationId: org.id, actorId: user.id },
        lead,
        { companyId, companyName, opportunityName },
      ),
    );

    revalidateLead(lead.id);
    revalidatePath("/opportunities");
    revalidatePath("/companies");
    return { success: true, opportunityId: result.opportunityId };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo convertir el lead.",
    };
  }
}
