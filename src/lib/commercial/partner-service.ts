import { withOrgTransaction } from "@/lib/tenant";
import { recordStatusChange } from "@/lib/commercial/history";
import type { CommercialContext, ServiceResult } from "@/lib/commercial/opportunity-service";
import {
  validateAllianceChange,
  type AllianceStage,
  type AllianceStatus,
} from "@/lib/commercial/partners";

export async function changeAlliance(
  ctx: CommercialContext,
  partnerId: string,
  input: {
    stage?: AllianceStage | null;
    status?: AllianceStatus;
    reason?: string | null;
    agreementTerms?: string | null;
    agreementSignedAt?: Date | null;
  },
): Promise<ServiceResult<null>> {
  try {
    await withOrgTransaction(ctx.organizationId, async (tx) => {
      const partner = await tx.commercialPartner.findFirst({
        where: { id: partnerId, organizationId: ctx.organizationId },
        select: { id: true, allianceStage: true, allianceStatus: true, agreementTerms: true },
      });
      if (!partner) throw new Error("Partner no encontrado");
      const check = validateAllianceChange(partner, input);
      if (!check.ok) throw new Error(check.error);
      const now = new Date();
      await tx.commercialPartner.update({
        where: { id: partner.id, organizationId: ctx.organizationId },
        data: {
          ...(input.stage !== undefined
            ? { allianceStage: input.stage, allianceStageChangedAt: now }
            : {}),
          ...(input.status ? { allianceStatus: input.status, allianceStatusReason: input.reason?.trim() || null } : {}),
          ...(input.agreementTerms !== undefined ? { agreementTerms: input.agreementTerms?.trim() || null } : {}),
          ...(input.agreementSignedAt !== undefined ? { agreementSignedAt: input.agreementSignedAt } : {}),
        },
      });
      if (input.stage !== undefined && input.stage !== partner.allianceStage) {
        await recordStatusChange(tx, {
          organizationId: ctx.organizationId,
          entityType: "commercial_partner",
          entityId: partner.id,
          field: "alliance_stage",
          fromValue: partner.allianceStage,
          toValue: input.stage ?? "none",
          actorId: ctx.actorId,
          source: ctx.source,
          reason: input.reason,
          at: now,
        });
      }
      if (input.status && input.status !== partner.allianceStatus) {
        await recordStatusChange(tx, {
          organizationId: ctx.organizationId,
          entityType: "commercial_partner",
          entityId: partner.id,
          field: "alliance_status",
          fromValue: partner.allianceStatus,
          toValue: input.status,
          actorId: ctx.actorId,
          source: ctx.source,
          reason: input.reason,
          at: now,
        });
      }
    });
    return { ok: true, value: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo actualizar la alianza." };
  }
}
