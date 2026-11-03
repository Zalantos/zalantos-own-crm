import type { Prisma } from "@prisma/client";

// Escrituras de auditoría del proceso comercial. Reciben un TransactionClient
// crudo (organizationId explícito en cada where/data) para escribirse en la
// misma transacción que el cambio de dominio.

type Tx = Prisma.TransactionClient;

export type StageTransitionInput = {
  organizationId: string;
  opportunityId: string;
  stage: { id: string; key: string; label: string };
  actorId: string | null;
  // manual | agent | meeting | workflow | inbound_lead | lead_conversion | migration
  source: string;
  reason?: string | null;
  at?: Date;
};

// Cierra el período abierto (si lo hay) y abre uno nuevo en la etapa destino.
// Actualiza Opportunity.stageEnteredAt. No hace nada si ya está en esa etapa.
export async function recordStageTransition(
  tx: Tx,
  input: StageTransitionInput,
): Promise<void> {
  const at = input.at ?? new Date();
  const open = await tx.opportunityStageHistory.findFirst({
    where: {
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      exitedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, stageId: true },
  });
  if (open?.stageId === input.stage.id) return;
  if (open) {
    await tx.opportunityStageHistory.updateMany({
      where: {
        organizationId: input.organizationId,
        opportunityId: input.opportunityId,
        exitedAt: null,
      },
      data: { exitedAt: at },
    });
  }
  await tx.opportunityStageHistory.create({
    data: {
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      stageId: input.stage.id,
      stageKey: input.stage.key,
      stageLabel: input.stage.label,
      enteredAt: at,
      source: input.source,
      actorId: input.actorId,
      reason: input.reason ?? null,
    },
  });
  await tx.opportunity.update({
    where: { id: input.opportunityId, organizationId: input.organizationId },
    data: { stageEnteredAt: at },
  });
}

export type StatusChangeLogInput = {
  organizationId: string;
  entityType: "opportunity" | "commercial_lead" | "commercial_partner";
  entityId: string;
  field?: "status" | "alliance_stage" | "alliance_status";
  fromValue: string | null;
  toValue: string;
  actorId: string | null;
  source: string;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
  at?: Date;
};

export async function recordStatusChange(
  tx: Tx,
  input: StatusChangeLogInput,
): Promise<void> {
  if (input.fromValue === input.toValue) return;
  await tx.commercialStatusChange.create({
    data: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field ?? "status",
      fromValue: input.fromValue,
      toValue: input.toValue,
      actorId: input.actorId,
      source: input.source,
      reason: input.reason ?? null,
      metadata: input.metadata,
      ...(input.at ? { changedAt: input.at } : {}),
    },
  });
}
