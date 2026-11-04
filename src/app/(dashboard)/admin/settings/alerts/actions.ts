"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireOrgAdminContext } from "@/lib/tenant";
import {
  ALERT_CONDITIONS,
  ALERT_DAY_TYPES,
  ALERT_PIPELINES,
  ALERT_SEVERITIES,
  isValidRuleTarget,
} from "@/lib/commercial/alerts";
import { syncCommercialAlerts } from "@/lib/commercial/alert-service";

export type RuleFormState = { error: string } | { ok: true; message: string } | undefined;

const ruleSchema = z.object({
  pipeline: z.enum(ALERT_PIPELINES),
  stageKey: z.string().trim().min(1, "Selecciona la etapa."),
  condition: z.enum(ALERT_CONDITIONS),
  thresholdDays: z.coerce.number().int().min(0, "Los días no pueden ser negativos.").max(365),
  dayType: z.enum(ALERT_DAY_TYPES),
  severity: z.enum(ALERT_SEVERITIES),
  recipient: z.string().trim().min(1),
});

function parseRule(formData: FormData) {
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa la regla." } as const;
  }
  const { recipient, ...rule } = parsed.data;
  if (!isValidRuleTarget(rule.stageKey, rule.condition)) {
    return {
      error: "La condición de reactivación solo aplica a oportunidades pausadas, y las pausadas solo admiten esa condición.",
    } as const;
  }
  return {
    data: {
      ...rule,
      recipientType: recipient === "owner" ? "owner" : "user",
      recipientUserId: recipient === "owner" ? null : recipient,
    },
  } as const;
}

async function assertRecipient(
  db: Awaited<ReturnType<typeof requireOrgAdminContext>>["db"],
  recipientUserId: string | null,
) {
  if (!recipientUserId) return true;
  const user = await db.user.findFirst({ where: { id: recipientUserId, isActive: true }, select: { id: true } });
  return Boolean(user);
}

// Reconcilia al cambiar reglas para que el efecto se vea sin esperar al cron.
async function afterChange(
  db: Awaited<ReturnType<typeof requireOrgAdminContext>>["db"],
  organizationId: string,
) {
  await syncCommercialAlerts(db, organizationId);
  revalidatePath("/admin/settings/alerts");
  revalidatePath("/opportunities");
  revalidatePath("/prospecting");
  revalidatePath("/dashboard");
}

export async function createAlertRule(_prev: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const { org, db } = await requireOrgAdminContext();
  const parsed = parseRule(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Revisa la regla." };
  if (!(await assertRecipient(db, parsed.data.recipientUserId))) {
    return { error: "El destinatario no es válido." };
  }
  try {
    await db.commercialAlertRule.create({ data: { ...parsed.data, organizationId: org.id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una regla con esa etapa y condición: edítala." };
    }
    throw error;
  }
  await afterChange(db, org.id);
  return { ok: true, message: "Regla creada." };
}

export async function updateAlertRule(
  ruleId: string,
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const { org, db } = await requireOrgAdminContext();
  const parsed = parseRule(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Revisa la regla." };
  if (!(await assertRecipient(db, parsed.data.recipientUserId))) {
    return { error: "El destinatario no es válido." };
  }
  try {
    await db.commercialAlertRule.update({ where: { id: ruleId }, data: parsed.data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una regla con esa etapa y condición." };
    }
    return { error: "Regla no encontrada." };
  }
  await afterChange(db, org.id);
  return { ok: true, message: "Regla actualizada." };
}

export async function toggleAlertRule(ruleId: string, isActive: boolean) {
  const { org, db } = await requireOrgAdminContext();
  await db.commercialAlertRule.update({ where: { id: ruleId }, data: { isActive } });
  await afterChange(db, org.id);
}

export async function deleteAlertRule(ruleId: string) {
  const { org, db } = await requireOrgAdminContext();
  // Las alertas históricas conservan su motivo: ruleId queda en null.
  await db.commercialAlertRule.delete({ where: { id: ruleId } });
  await afterChange(db, org.id);
}
