import { prisma } from "@/lib/prisma";
import { OpportunityStage, type Prisma } from "@prisma/client";
import { appendTimelineEvent } from "@/lib/timeline";
import { evaluateWorkflows } from "@/lib/workflows/engine";

type ApplyContext = {
  companyId: string;
  meetingOpportunityId: string | null;
  meetingTitle: string;
};

type ItemRecord = {
  id: string;
  type: string;
  entity: string;
  entityId: string | null;
  afterValue: Prisma.JsonValue;
  approved: boolean;
  status: string;
};

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Whitelisted, coerced field writes. Anything outside the allowlist is refused
// so the model can't set arbitrary/unsafe columns.
const COMPANY_STRING = new Set([
  "industry",
  "size",
  "country",
  "city",
  "description",
  "status",
]);
const OPPORTUNITY_STRING = new Set([
  "mainPain",
  "urgency",
  "nextStep",
  "status",
  "lossReason",
  "source",
]);

function coerceCompanyField(field: string, value: unknown): Prisma.CompanyUpdateInput {
  if (COMPANY_STRING.has(field)) return { [field]: value == null ? null : String(value) };
  if (field === "painScore") return { painScore: value == null ? null : Number(value) };
  throw new Error(`Campo de empresa no permitido: ${field}`);
}

function coerceOpportunityField(
  field: string,
  value: unknown,
): Prisma.OpportunityUpdateInput {
  if (OPPORTUNITY_STRING.has(field))
    return { [field]: value == null ? null : String(value) };
  if (field === "probability")
    return { probability: value == null ? null : Number(value) };
  if (field === "estimatedValue")
    return { estimatedValue: value == null ? null : String(value) };
  if (field === "expectedCloseDate" || field === "nextStepDueDate")
    return { [field]: value == null ? null : new Date(String(value)) };
  throw new Error(`Campo de oportunidad no permitido: ${field}`);
}

function coercePersonField(field: string, value: unknown): Prisma.PersonUpdateInput {
  if (["email", "phone", "roleTitle"].includes(field))
    return { [field]: value == null ? null : String(value) };
  if (["isDecisionMaker", "isSponsor"].includes(field))
    return { [field]: Boolean(value) };
  throw new Error(`Campo de persona no permitido: ${field}`);
}

// Applies one item, throwing on any problem so the caller can mark it failed
// without touching sibling items.
async function applyItem(
  tx: Prisma.TransactionClient,
  item: ItemRecord,
  ctx: ApplyContext,
): Promise<void> {
  const after = asRecord(item.afterValue);

  switch (item.type) {
    case "update_field": {
      const field = String(after.field);
      const value = after.value;
      if (item.entity === "company") {
        const id = item.entityId ?? ctx.companyId;
        await tx.company.update({ where: { id }, data: coerceCompanyField(field, value) });
      } else if (item.entity === "opportunity") {
        if (!item.entityId) throw new Error("Falta oportunidad destino");
        await tx.opportunity.update({
          where: { id: item.entityId },
          data: coerceOpportunityField(field, value),
        });
      } else if (item.entity === "person") {
        if (!item.entityId) throw new Error("Falta persona destino");
        await tx.person.update({
          where: { id: item.entityId },
          data: coercePersonField(field, value),
        });
      } else {
        throw new Error(`Entidad no soportada: ${item.entity}`);
      }
      break;
    }

    case "update_pain": {
      if (!item.entityId) throw new Error("Falta oportunidad destino");
      await tx.opportunity.update({
        where: { id: item.entityId },
        data: { mainPain: String(after.value ?? "") },
      });
      break;
    }

    case "stage_change": {
      if (!item.entityId) throw new Error("Falta oportunidad destino");
      const stage = String(after.value);
      if (!(Object.values(OpportunityStage) as string[]).includes(stage)) {
        throw new Error(`Etapa inválida: ${stage}`);
      }
      await tx.opportunity.update({
        where: { id: item.entityId },
        data: { stage: stage as OpportunityStage },
      });
      break;
    }

    case "add_contact": {
      await tx.person.create({
        data: {
          companyId: ctx.companyId,
          firstName: String(after.firstName ?? "").trim() || "Sin nombre",
          lastName: String(after.lastName ?? ""),
          email: after.email ? String(after.email) : null,
          roleTitle: after.roleTitle ? String(after.roleTitle) : null,
          isDecisionMaker: Boolean(after.isDecisionMaker),
          isSponsor: Boolean(after.isSponsor),
        },
      });
      break;
    }

    case "create_task": {
      const dueInDays = after.dueInDays == null ? null : Number(after.dueInDays);
      await tx.activity.create({
        data: {
          companyId: ctx.companyId,
          opportunityId: ctx.meetingOpportunityId,
          type: "task",
          title: String(after.title ?? "Tarea"),
          description: after.description ? String(after.description) : null,
          dueDate:
            dueInDays == null
              ? null
              : new Date(Date.now() + dueInDays * 86_400_000),
          status: "pending",
        },
      });
      break;
    }

    case "add_note": {
      await tx.note.create({
        data: {
          companyId: ctx.companyId,
          opportunityId: ctx.meetingOpportunityId,
          title: after.title ? String(after.title) : null,
          body: String(after.body ?? ""),
        },
      });
      break;
    }

    default:
      throw new Error(`Tipo de cambio desconocido: ${item.type}`);
  }
}

// Applies every approved item of a proposal. Each item is applied in its own
// transaction so one failure doesn't roll back the rest (item → status=failed).
export async function applyProposal(
  proposalId: string,
  actorId: string,
): Promise<{ applied: number; failed: number }> {
  const proposal = await prisma.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    include: { items: true, meeting: true },
  });
  if (!proposal) throw new Error("Propuesta no encontrada");

  const ctx: ApplyContext = {
    companyId: proposal.meeting.companyId,
    meetingOpportunityId: proposal.meeting.opportunityId,
    meetingTitle: proposal.meeting.title,
  };

  let applied = 0;
  let failed = 0;
  const stageChanges: { opportunityId: string; from: unknown; to: unknown }[] = [];

  for (const item of proposal.items) {
    if (!item.approved || item.status === "applied") continue;
    try {
      await prisma.$transaction(async (tx) => {
        await applyItem(tx, item, ctx);
        await tx.cRMChangeItem.update({
          where: { id: item.id },
          data: { status: "applied", appliedAt: new Date() },
        });
      });
      applied += 1;
      if (item.type === "stage_change" && item.entityId) {
        const after = asRecord(item.afterValue);
        stageChanges.push({
          opportunityId: item.entityId,
          from: asRecord(item.beforeValue as Prisma.JsonValue).value,
          to: after.value,
        });
      }
    } catch (error) {
      failed += 1;
      await prisma.cRMChangeItem.update({
        where: { id: item.id },
        data: { status: "failed" },
      });
      console.error(`[apply] item ${item.id} falló`, error);
    }
  }

  // Recompute proposal status and record the timeline event.
  const hasRejected = proposal.items.some((i) => !i.approved);
  const nextStatus =
    failed > 0 || hasRejected ? "partially_approved" : "applied";

  await prisma.cRMChangeProposal.update({
    where: { id: proposalId },
    data: { status: nextStatus, reviewedBy: actorId, reviewedAt: new Date() },
  });

  await appendTimelineEvent(prisma, {
    companyId: ctx.companyId,
    opportunityId: ctx.meetingOpportunityId,
    type: "proposal_applied",
    title: `Cambios aplicados desde "${ctx.meetingTitle}"`,
    summary: `${applied} cambio(s) aplicado(s)${failed ? `, ${failed} fallido(s)` : ""}.`,
    refType: "proposal",
    refId: proposalId,
    actorId,
  });

  // Fire existing workflow engine for each applied stage change.
  for (const change of stageChanges) {
    await evaluateWorkflows({
      entityType: "opportunity",
      entityId: change.opportunityId,
      eventName: "stage_changed",
      before: { stage: change.from },
      after: { stage: change.to },
    });
  }

  return { applied, failed };
}
