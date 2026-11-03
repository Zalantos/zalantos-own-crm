import { generateText } from "ai";
import { z } from "zod";
import type { TenantClient } from "@/lib/tenant";
import { ACTIVITY_OPEN_STATUSES } from "@/lib/activity-status";
import { resolveAgentModel } from "@/lib/agent/model";
import {
  leadSuggestions,
  NEXT_STEP_CHANNELS,
  opportunitySuggestions,
  partnerSuggestions,
  type NextActionSuggestion,
} from "@/lib/commercial/next-action";
import type { NextActionEntity } from "@/lib/commercial/opportunity-service";

const taskInclude = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { name: true, email: true } },
} as const;

function linkWhere(entity: NextActionEntity, id: string) {
  return entity === "opportunity"
    ? { opportunityId: id }
    : entity === "commercial_lead"
      ? { commercialLeadId: id }
      : { commercialPartnerId: id };
}

// Tareas (pendientes/hechas) e interacciones registradas de una ficha. Las
// actividades registradas (occurredAt) nunca cuentan como tareas.
export async function loadFollowUpRecords(
  db: TenantClient,
  entity: NextActionEntity,
  id: string,
) {
  const where = linkWhere(entity, id);
  const [openTasks, doneTasks, interactions] = await Promise.all([
    db.activity.findMany({
      where: { ...where, occurredAt: null, status: { in: ACTIVITY_OPEN_STATUSES } },
      include: taskInclude,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.activity.findMany({
      where: { ...where, occurredAt: null, status: "done" },
      include: taskInclude,
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
    db.activity.findMany({
      where: { ...where, occurredAt: { not: null } },
      include: {
        ...taskInclude,
        person: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
  ]);
  return { openTasks, doneTasks, interactions };
}

export type FollowUpRecords = Awaited<ReturnType<typeof loadFollowUpRecords>>;

function overdue(tasks: FollowUpRecords["openTasks"], now: Date) {
  return tasks
    .filter((task) => task.dueDate && task.dueDate < now)
    .map((task) => ({ title: task.title, dueDate: task.dueDate as Date }));
}

export async function opportunityFollowUpSuggestions(
  db: TenantClient,
  opportunity: {
    id: string;
    status: string;
    ownerId: string | null;
    nextStep: string | null;
    nextStepDueDate: Date | null;
    nextStepUpdatedAt: Date | null;
    proposalSentAt: Date | null;
    expectedResponseAt: Date | null;
    reactivateAt: Date | null;
    stage: { key: string };
  },
  records: FollowUpRecords,
  now: Date = new Date(),
): Promise<NextActionSuggestion[]> {
  const lastMeeting = await db.meeting.findFirst({
    where: { opportunityId: opportunity.id, meetingDate: { lte: now } },
    orderBy: { meetingDate: "desc" },
    select: { meetingDate: true },
  });
  return opportunitySuggestions(
    {
      status: opportunity.status,
      stageKey: opportunity.stage.key,
      ownerId: opportunity.ownerId,
      nextStep: opportunity.nextStep,
      nextStepDueDate: opportunity.nextStepDueDate,
      nextStepUpdatedAt: opportunity.nextStepUpdatedAt,
      proposalSentAt: opportunity.proposalSentAt,
      expectedResponseAt: opportunity.expectedResponseAt,
      reactivateAt: opportunity.reactivateAt,
      lastInteractionAt: records.interactions[0]?.occurredAt ?? null,
      lastMeetingAt: lastMeeting?.meetingDate ?? null,
      overdueTasks: overdue(records.openTasks, now),
    },
    now,
  );
}

export function leadFollowUpSuggestions(
  lead: {
    status: string;
    ownerId: string | null;
    createdVia: string;
    firstContactAt: Date | null;
    becameLeadAt: Date | null;
    lastInteractionAt: Date | null;
    nextStep: string | null;
    nextStepDueDate: Date | null;
    _count: { opportunities: number };
  },
  records: FollowUpRecords,
  now: Date = new Date(),
) {
  return leadSuggestions(
    {
      status: lead.status,
      ownerId: lead.ownerId,
      createdVia: lead.createdVia,
      firstContactAt: lead.firstContactAt,
      becameLeadAt: lead.becameLeadAt,
      lastInteractionAt: lead.lastInteractionAt,
      nextStep: lead.nextStep,
      nextStepDueDate: lead.nextStepDueDate,
      opportunityCount: lead._count.opportunities,
      overdueTasks: overdue(records.openTasks, now),
    },
    now,
  );
}

export { partnerSuggestions };

// ---------------------------------------------------------------------------
// Nivel 2: sugerencia IA bajo demanda (nunca en render). No escribe nada:
// el usuario decide si la convierte en próxima acción.
// ---------------------------------------------------------------------------

export const aiSuggestionSchema = z.object({
  action: z.string().min(3).max(300),
  channel: z.enum(NEXT_STEP_CHANNELS).nullable(),
  dueInDays: z.number().int().min(0).max(60).nullable(),
  reason: z.string().min(3).max(600),
});

export type AiNextActionSuggestion = z.infer<typeof aiSuggestionSchema>;

const AI_INSTRUCTIONS = `Sos un asistente comercial B2B. Con el contexto JSON de una ficha del CRM (etapa, estado, interacciones, tareas, notas y reuniones) sugerí UNA próxima mejor acción concreta y realista.
Reglas:
- No inventes datos que no estén en el contexto (montos, personas, fechas).
- La acción la ejecuta un humano: nunca digas que ya se envió algo.
- Si el registro está cerrado o falta información, sugerí la acción que destrabe el seguimiento.
Respondé SOLO con JSON: {"action": string, "channel": "call"|"email"|"whatsapp"|"linkedin"|"meeting"|"other"|null, "dueInDays": number|null, "reason": string}`;

function stripFences(text: string) {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

export async function suggestNextActionWithModel(
  context: unknown,
): Promise<AiNextActionSuggestion> {
  const { text } = await generateText({
    model: resolveAgentModel(),
    temperature: 0.2,
    instructions: AI_INSTRUCTIONS,
    messages: [{ role: "user", content: JSON.stringify(context).slice(0, 24_000) }],
  });
  return aiSuggestionSchema.parse(JSON.parse(stripFences(text)));
}
