"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant";

function refresh(alert: { opportunityId: string | null; commercialLeadId: string | null }) {
  if (alert.opportunityId) revalidatePath(`/opportunities/${alert.opportunityId}`);
  if (alert.commercialLeadId) revalidatePath(`/prospecting/${alert.commercialLeadId}`);
  revalidatePath("/opportunities");
  revalidatePath("/prospecting");
  revalidatePath("/dashboard");
}

const selectRecord = { opportunityId: true, commercialLeadId: true } as const;

// Reconocer: alguien la vio y se hace cargo; sigue visible en la ficha pero
// deja de marcar la tarjeta. Si la condición desaparece se resuelve sola.
export async function acknowledgeAlertAction(alertId: string) {
  const { user, db } = await requireOrgContext();
  const alert = await db.commercialAlert.findUnique({ where: { id: alertId }, select: selectRecord });
  if (!alert) throw new Error("Alerta no encontrada");
  await db.commercialAlert.updateMany({
    where: { id: alertId, status: "open" },
    data: { status: "acknowledged", acknowledgedAt: new Date(), acknowledgedById: user.id },
  });
  refresh(alert);
}

// Resolver a mano: no vuelve a aparecer para este mismo período (dedupeKey).
export async function resolveAlertAction(alertId: string) {
  const { user, db } = await requireOrgContext();
  const alert = await db.commercialAlert.findUnique({ where: { id: alertId }, select: selectRecord });
  if (!alert) throw new Error("Alerta no encontrada");
  await db.commercialAlert.updateMany({
    where: { id: alertId, status: { in: ["open", "acknowledged"] } },
    data: { status: "resolved", resolvedAt: new Date(), resolvedById: user.id, resolution: "manual" },
  });
  refresh(alert);
}
