"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import {
  updateNextAction,
  type NextActionEntity,
} from "@/lib/commercial/opportunity-service";
import { insertLoggedActivity } from "@/lib/crm/activity-records";
import { INTERACTION_TYPES } from "@/lib/activity-types";
import { NEXT_STEP_CHANNELS } from "@/lib/commercial/next-action";
import {
  loadFollowUpRecords,
  suggestNextActionWithModel,
  type AiNextActionSuggestion,
} from "@/lib/commercial/follow-up";
import { recordParentPath } from "@/lib/commercial/links";

const entitySchema = z.enum(["opportunity", "commercial_lead", "commercial_partner"]);

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const nextActionSchema = z.object({
  nextStep: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
  nextStepDueDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  nextStepChannel: z.preprocess(emptyToUndefined, z.enum(NEXT_STEP_CHANNELS).optional()),
  nextStepContext: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
  nextStepActivityId: z.preprocess(emptyToUndefined, z.string().optional()),
});

const completeSchema = nextActionSchema.extend({
  outcome: z.string().trim().min(1, "Registra el resultado de la acción."),
  interactionType: z.preprocess(emptyToUndefined, z.enum(INTERACTION_TYPES).optional()),
});

export type NextActionFormState =
  | { error: string }
  | { success: true; message: string }
  | undefined;

function pathFor(entity: NextActionEntity, id: string) {
  return recordParentPath(
    entity === "opportunity"
      ? { opportunityId: id }
      : entity === "commercial_lead"
        ? { commercialLeadId: id }
        : { commercialPartnerId: id },
  );
}

export async function saveNextAction(
  entity: NextActionEntity,
  id: string,
  _prev: NextActionFormState,
  formData: FormData,
): Promise<NextActionFormState> {
  const { user, org, db } = await requireOrgContext();
  entitySchema.parse(entity);
  const parsed = nextActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos de la próxima acción." };
  if (parsed.data.nextStep && !parsed.data.nextStepDueDate) {
    return { error: "Indica la fecha de la próxima acción." };
  }
  const result = await updateNextAction(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    entity,
    id,
    {
      nextStep: parsed.data.nextStep ?? null,
      nextStepDueDate: parsed.data.nextStepDueDate ?? null,
      nextStepChannel: parsed.data.nextStepChannel ?? null,
      nextStepContext: parsed.data.nextStepContext ?? null,
      nextStepActivityId: parsed.data.nextStepActivityId ?? null,
    },
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(pathFor(entity, id));
  return { success: true, message: "Próxima acción guardada." };
}

// Completa la próxima acción: registra el resultado (como interacción si se
// indicó canal, y en la tarea vinculada si la hay) y deja la nueva próxima
// acción propuesta (o ninguna).
export async function completeNextAction(
  entity: NextActionEntity,
  id: string,
  _prev: NextActionFormState,
  formData: FormData,
): Promise<NextActionFormState> {
  const { user, org, db } = await requireOrgContext();
  entitySchema.parse(entity);
  const parsed = completeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  }
  const input = parsed.data;
  if (input.nextStep && !input.nextStepDueDate) {
    return { error: "Indica la fecha de la nueva próxima acción." };
  }

  const record =
    entity === "opportunity"
      ? await db.opportunity.findUnique({
          where: { id },
          select: { nextStep: true, nextStepActivityId: true, companyId: true, decisionMakerId: true },
        })
      : entity === "commercial_lead"
        ? await db.commercialLead.findUnique({
            where: { id },
            select: { nextStep: true, nextStepActivityId: true, companyId: true, personId: true },
          })
        : await db.commercialPartner.findUnique({
            where: { id },
            select: { nextStep: true, nextStepActivityId: true, linkedCompanyId: true, linkedPersonId: true },
          });
  if (!record) return { error: "Registro no encontrado." };
  const companyId =
    "companyId" in record ? record.companyId : record.linkedCompanyId;
  const personId =
    "decisionMakerId" in record
      ? record.decisionMakerId
      : "personId" in record
        ? record.personId
        : record.linkedPersonId;

  try {
    await withOrgTransaction(org.id, async (tx) => {
      if (record.nextStepActivityId) {
        const now = new Date();
        const member = await tx.teamMember.findFirst({
          where: { organizationId: org.id, userId: user.id },
          select: { id: true },
        });
        await tx.activity.updateMany({
          where: {
            id: record.nextStepActivityId,
            organizationId: org.id,
            status: { not: "done" },
          },
          data: {
            status: "done",
            completedAt: now,
            statusChangedAt: now,
            completedById: member?.id ?? null,
            outcomes: input.outcome,
            blockedReason: null,
          },
        });
      }
      if (input.interactionType) {
        await insertLoggedActivity(
          tx,
          { organizationId: org.id, actorId: user.id, createdVia: "manual" },
          {
            companyId,
            opportunityId: entity === "opportunity" ? id : null,
            commercialLeadId: entity === "commercial_lead" ? id : null,
            commercialPartnerId: entity === "commercial_partner" ? id : null,
            personIds: personId ? [personId] : [],
            type: input.interactionType,
            title: record.nextStep ?? "Acción comercial",
            occurredAt: new Date(),
            durationMinutes: null,
            channel: null,
            summary: null,
            outcomes: input.outcome,
          },
        );
      }
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo completar la acción." };
  }

  const result = await updateNextAction(
    { db, organizationId: org.id, actorId: user.id, source: "manual" },
    entity,
    id,
    {
      nextStep: input.nextStep ?? null,
      nextStepDueDate: input.nextStepDueDate ?? null,
      nextStepChannel: input.nextStepChannel ?? null,
      nextStepContext: input.nextStepContext ?? null,
      nextStepActivityId: input.nextStepActivityId ?? null,
    },
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(pathFor(entity, id));
  revalidatePath("/activities");
  return {
    success: true,
    message: input.nextStep
      ? "Acción completada y nueva próxima acción guardada."
      : "Acción completada. Define la siguiente cuando corresponda.",
  };
}

export type AiSuggestionState =
  | { error: string }
  | { suggestion: AiNextActionSuggestion }
  | undefined;

// Sugerencia IA bajo demanda: arma un contexto acotado de la ficha y llama
// al modelo una vez. No modifica el CRM.
export async function suggestNextActionAI(
  entity: NextActionEntity,
  id: string,
): Promise<AiSuggestionState> {
  const { db } = await requireOrgContext();
  entitySchema.parse(entity);
  const records = await loadFollowUpRecords(db, entity, id);
  const linkWhere =
    entity === "opportunity"
      ? { opportunityId: id }
      : entity === "commercial_lead"
        ? { commercialLeadId: id }
        : { commercialPartnerId: id };
  const [record, notes, meetings] = await Promise.all([
    entity === "opportunity"
      ? db.opportunity.findUnique({
          where: { id },
          select: {
            name: true,
            status: true,
            mainPain: true,
            situation: true,
            impact: true,
            criticalEvent: true,
            proposalSentAt: true,
            expectedResponseAt: true,
            nextStep: true,
            nextStepDueDate: true,
            stage: { select: { label: true } },
            company: { select: { name: true } },
          },
        })
      : entity === "commercial_lead"
        ? db.commercialLead.findUnique({
            where: { id },
            select: {
              title: true,
              status: true,
              interestSignal: true,
              description: true,
              firstContactAt: true,
              nextStep: true,
              nextStepDueDate: true,
            },
          })
        : db.commercialPartner.findUnique({
            where: { id },
            select: {
              displayName: true,
              allianceStage: true,
              allianceStatus: true,
              commercialPotential: true,
              agreementTerms: true,
              nextStep: true,
              nextStepDueDate: true,
            },
          }),
    db.note.findMany({
      where: linkWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { title: true, body: true, createdAt: true },
    }),
    entity === "opportunity"
      ? db.meeting.findMany({
          where: { opportunityId: id },
          orderBy: { meetingDate: "desc" },
          take: 3,
          select: { title: true, meetingDate: true, aiSummary: true },
        })
      : Promise.resolve([]),
  ]);
  if (!record) return { error: "Registro no encontrado." };
  try {
    const suggestion = await suggestNextActionWithModel({
      today: new Date().toISOString().slice(0, 10),
      entity,
      record,
      openTasks: records.openTasks.map((task) => ({ title: task.title, dueDate: task.dueDate })),
      recentInteractions: records.interactions.slice(0, 8).map((activity) => ({
        type: activity.type,
        title: activity.title,
        occurredAt: activity.occurredAt,
        outcomes: activity.outcomes,
      })),
      notes: notes.map((note) => ({ ...note, body: note.body.slice(0, 800) })),
      meetings,
    });
    return { suggestion };
  } catch (error) {
    console.error("[follow-up] sugerencia IA falló", error);
    return { error: "No se pudo obtener una sugerencia de IA en este momento." };
  }
}
