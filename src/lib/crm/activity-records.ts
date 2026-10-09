import type { Prisma } from "@prisma/client";
import { appendTimelineEvent } from "@/lib/timeline";
import {
  ACTIVITY_TYPES,
  activityTypeLabel,
  type ActivityType,
} from "@/lib/activity-types";
import {
  ACTIVITY_STATUS_LABELS,
  isActivityStatus,
  type ActivityStatus,
} from "@/lib/activity-status";
import {
  ACTIVITY_PRIORITY_LABELS,
  type ActivityPriority,
} from "@/lib/activity-priority";

// Escrituras de actividades registradas, reuniones manuales y edición de
// tareas compartidas por las tools del agente/MCP (escritura al instante) y
// por apply.ts (al aplicar una propuesta). Reciben un TransactionClient crudo,
// así que organizationId va explícito en cada where/data (ver
// withOrgTransaction en @/lib/tenant). Cada insert/update devuelve lo
// necesario para deshacerlo.

const SUMMARY_MAX_CHARS = 200;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export type WriteBase = {
  organizationId: string;
  actorId: string;
  // agent | meeting | enrichment | manual: mismo vocabulario que createdVia.
  createdVia: string;
  // Extra para los eventos de timeline (via, proposalId...).
  metadata?: Record<string, Prisma.InputJsonValue>;
};

// ---------------------------------------------------------------------------
// Actividad registrada (llamada, email, visita... que ya ocurrió)
// ---------------------------------------------------------------------------

export const LOGGED_ACTIVITY_TYPES = [
  "meeting",
  "call",
  "email",
  "visit",
  "other",
] as const;

export type LoggedActivityType = (typeof LOGGED_ACTIVITY_TYPES)[number];

export type LoggedActivityInput = {
  companyId: string;
  opportunityId: string | null;
  personIds: string[];
  type: LoggedActivityType;
  title: string;
  occurredAt: Date;
  durationMinutes: number | null;
  channel: string | null;
  summary: string | null;
  outcomes: string | null;
};

export type LoggedActivityRevert = {
  activityId: string;
  // lastContactAt que tenía la empresa antes; solo se restaura si lo movimos.
  lastContactUpdated: boolean;
  prevLastContactAt: string | null;
  timelineEventId: string | null;
};

export async function insertLoggedActivity(
  tx: Prisma.TransactionClient,
  base: WriteBase,
  input: LoggedActivityInput,
): Promise<LoggedActivityRevert> {
  const personIds = [...new Set(input.personIds)];
  const activity = await tx.activity.create({
    data: {
      organizationId: base.organizationId,
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      // La UI muestra una sola persona: la primera es la principal.
      personId: personIds[0] ?? null,
      type: input.type,
      title: input.title,
      description: input.summary,
      outcomes: input.outcomes,
      occurredAt: input.occurredAt,
      durationMinutes: input.durationMinutes,
      channel: input.channel,
      // Ya ocurrió: nace hecha para no aparecer como pendiente en tableros,
      // agenda ni recordatorios.
      status: "done",
      completedAt: input.occurredAt,
      statusChangedAt: new Date(),
      createdById: base.actorId,
      createdVia: base.createdVia,
      participants: {
        create: personIds.map((personId) => ({
          organizationId: base.organizationId,
          personId,
        })),
      },
    },
    select: { id: true },
  });

  // lastContactAt solo avanza: registrar una llamada vieja no pisa un
  // contacto más reciente, y una fecha futura no cuenta como contacto.
  const company = await tx.company.findFirst({
    where: { id: input.companyId, organizationId: base.organizationId },
    select: { lastContactAt: true },
  });
  const prev = company?.lastContactAt ?? null;
  const lastContactUpdated =
    input.occurredAt.getTime() <= Date.now() &&
    (!prev || input.occurredAt > prev);
  if (lastContactUpdated) {
    await tx.company.updateMany({
      where: { id: input.companyId, organizationId: base.organizationId },
      data: { lastContactAt: input.occurredAt },
    });
  }

  const details = [
    input.channel,
    input.durationMinutes ? `${input.durationMinutes} min` : null,
  ].filter(Boolean);
  const text = input.summary ?? input.outcomes;
  const event = await appendTimelineEvent(tx, {
    organizationId: base.organizationId,
    companyId: input.companyId,
    opportunityId: input.opportunityId,
    type: "activity_logged",
    title: `${activityTypeLabel(input.type)}: ${input.title}`,
    summary:
      [details.join(" · "), text ? truncate(text, SUMMARY_MAX_CHARS) : null]
        .filter(Boolean)
        .join(" — ") || null,
    refType: "activity",
    refId: activity.id,
    actorId: base.actorId,
    metadata: { ...base.metadata, activityType: input.type },
    occurredAt: input.occurredAt,
  });

  return {
    activityId: activity.id,
    lastContactUpdated,
    prevLastContactAt: prev?.toISOString() ?? null,
    timelineEventId: event?.id ?? null,
  };
}

export async function revertLoggedActivity(
  tx: Prisma.TransactionClient,
  organizationId: string,
  revert: LoggedActivityRevert,
) {
  const activity = await tx.activity.findFirst({
    where: { id: revert.activityId, organizationId },
    select: { companyId: true, occurredAt: true },
  });
  if (!activity) return;
  // activity_people cae por ON DELETE CASCADE.
  await tx.activity.delete({
    where: { id: revert.activityId, organizationId },
  });
  // Solo se restaura si nadie movió lastContactAt después de nosotros.
  if (revert.lastContactUpdated && activity.companyId && activity.occurredAt) {
    await tx.company.updateMany({
      where: {
        id: activity.companyId,
        organizationId,
        lastContactAt: activity.occurredAt,
      },
      data: {
        lastContactAt: revert.prevLastContactAt
          ? new Date(revert.prevLastContactAt)
          : null,
      },
    });
  }
  if (revert.timelineEventId) {
    await tx.timelineEvent.deleteMany({
      where: { id: revert.timelineEventId, organizationId },
    });
  }
}

// ---------------------------------------------------------------------------
// Reunión manual (sin grabación ni transcripción)
// ---------------------------------------------------------------------------

export type MeetingParticipantInput = {
  name: string;
  email?: string | null;
  company?: string | null;
  role?: string | null;
  internal?: boolean | null;
};

export type ManualMeetingInput = {
  companyId: string;
  opportunityId: string | null;
  title: string;
  meetingType: string;
  meetingDate: Date;
  participants: MeetingParticipantInput[];
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  risks: string[];
  nextSteps: string[];
};

export type ManualMeetingRevert = {
  meetingId: string;
  timelineEventId: string | null;
};

// Mismo shape que buildAiSummary (pipeline) para que la ficha de la reunión
// y get_meeting lo lean igual que el de una reunión transcrita.
export function buildManualMeetingSummary(input: ManualMeetingInput) {
  return {
    headline: input.summary ?? "",
    keyPoints: input.keyPoints,
    decisions: input.decisions,
    risks: input.risks,
    nextSteps: input.nextSteps,
    source: "manual",
  };
}

// Participantes con el shape libre de Meeting.participants ({ name, email?,
// role? }), sumando company e internal; se omiten las claves vacías.
export function normalizeMeetingParticipants(
  participants: MeetingParticipantInput[],
) {
  return participants.map((participant) => ({
    name: participant.name,
    ...(participant.email ? { email: participant.email } : {}),
    ...(participant.company ? { company: participant.company } : {}),
    ...(participant.role ? { role: participant.role } : {}),
    ...(participant.internal != null ? { internal: participant.internal } : {}),
  }));
}

export async function insertManualMeeting(
  tx: Prisma.TransactionClient,
  base: WriteBase,
  input: ManualMeetingInput,
): Promise<ManualMeetingRevert> {
  const meeting = await tx.meeting.create({
    data: {
      organizationId: base.organizationId,
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      title: input.title,
      meetingType: input.meetingType,
      meetingDate: input.meetingDate,
      participants: normalizeMeetingParticipants(
        input.participants,
      ) as Prisma.InputJsonValue,
      sourceType: "manual",
      // No hay nada que procesar: el resumen llega cargado a mano.
      processingStatus: "ready",
      aiSummary: buildManualMeetingSummary(input) as Prisma.InputJsonValue,
      createdBy: base.actorId,
    },
    select: { id: true },
  });

  const event = await appendTimelineEvent(tx, {
    organizationId: base.organizationId,
    companyId: input.companyId,
    opportunityId: input.opportunityId,
    type: "meeting_created",
    title: `Reunión: ${input.title}`,
    summary: input.summary ? truncate(input.summary, SUMMARY_MAX_CHARS) : null,
    refType: "meeting",
    refId: meeting.id,
    actorId: base.actorId,
    metadata: { ...base.metadata, sourceType: "manual" },
  });

  return { meetingId: meeting.id, timelineEventId: event?.id ?? null };
}

export async function revertManualMeeting(
  tx: Prisma.TransactionClient,
  organizationId: string,
  revert: ManualMeetingRevert,
) {
  await tx.meeting.deleteMany({
    where: { id: revert.meetingId, organizationId },
  });
  if (revert.timelineEventId) {
    await tx.timelineEvent.deleteMany({
      where: { id: revert.timelineEventId, organizationId },
    });
  }
}

// ---------------------------------------------------------------------------
// Edición de tareas
// ---------------------------------------------------------------------------

// undefined = no tocar; null = vaciar.
export type TaskUpdateInput = {
  type?: ActivityType;
  status?: ActivityStatus;
  plannedDate?: Date | null;
  dueDate?: Date | null;
  assigneeId?: string | null;
  completedById?: string | null;
  title?: string;
  description?: string | null;
  blockedReason?: string | null;
  priority?: ActivityPriority | null;
};

// Lo que hay que restaurar al deshacer, serializable a JSON (revertData).
export type TaskSnapshot = {
  // Opcionales para poder revertir propuestas creadas antes de que estos
  // campos se incorporaran al snapshot persistido en revertData.
  type?: string;
  status: string;
  plannedDate?: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  title: string;
  description: string | null;
  priority: string | null;
  completedAt: string | null;
  completedById: string | null;
  statusChangedAt: string | null;
  blockedReason: string | null;
};

export type TaskUpdateRevert = {
  taskId: string;
  before: TaskSnapshot;
  timelineEventIds: string[];
};

export type TaskUpdateResult = TaskUpdateRevert & {
  // Para disparar workflows (status_changed) fuera de la transacción.
  statusChange: { from: string; to: string } | null;
  changedFields: string[];
};

const TASK_SNAPSHOT_SELECT = {
  id: true,
  companyId: true,
  opportunityId: true,
  occurredAt: true,
  type: true,
  status: true,
  plannedDate: true,
  dueDate: true,
  assigneeId: true,
  title: true,
  description: true,
  priority: true,
  completedAt: true,
  completedById: true,
  statusChangedAt: true,
  blockedReason: true,
} as const;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function statusLabel(status: string): string {
  return isActivityStatus(status) ? ACTIVITY_STATUS_LABELS[status] : status;
}

export async function findTaskForUpdate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  taskId: string,
) {
  const task = await tx.activity.findFirst({
    where: { id: taskId, organizationId },
    select: TASK_SNAPSHOT_SELECT,
  });
  // Una actividad registrada (ya ocurrida) no es una tarea editable.
  if (!task || task.occurredAt) return null;
  return task;
}

type TaskComparable = {
  type: string;
  status: string;
  plannedDate: Date | null;
  dueDate: Date | null;
  assigneeId: string | null;
  completedById: string | null;
  title: string;
  description: string | null;
  blockedReason: string | null;
  priority: string | null;
};

// Solo los campos de `input` que difieren del estado actual. Vacío = no hay
// nada que escribir (p. ej. completar una tarea ya hecha).
export function diffTaskUpdate(
  task: TaskComparable,
  input: TaskUpdateInput,
): TaskUpdateInput {
  const changes: TaskUpdateInput = {};
  if (input.type !== undefined && input.type !== task.type) {
    changes.type = input.type;
  }
  if (input.status !== undefined && input.status !== task.status) {
    changes.status = input.status;
  }
  if (
    input.plannedDate !== undefined &&
    iso(input.plannedDate) !== iso(task.plannedDate)
  ) {
    changes.plannedDate = input.plannedDate;
  }
  if (input.dueDate !== undefined && iso(input.dueDate) !== iso(task.dueDate)) {
    changes.dueDate = input.dueDate;
  }
  if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
    changes.assigneeId = input.assigneeId;
  }
  if (
    input.completedById !== undefined &&
    input.completedById !== task.completedById
  ) {
    changes.completedById = input.completedById;
  }
  if (input.title !== undefined && input.title !== task.title) {
    changes.title = input.title;
  }
  if (
    input.description !== undefined &&
    input.description !== task.description
  ) {
    changes.description = input.description;
  }
  if (
    input.blockedReason !== undefined &&
    input.blockedReason !== task.blockedReason
  ) {
    changes.blockedReason = input.blockedReason;
  }
  if (input.priority !== undefined && input.priority !== task.priority) {
    changes.priority = input.priority;
  }
  return changes;
}

export async function applyTaskUpdate(
  tx: Prisma.TransactionClient,
  base: WriteBase,
  taskId: string,
  input: TaskUpdateInput,
): Promise<TaskUpdateResult> {
  const task = await findTaskForUpdate(tx, base.organizationId, taskId);
  if (!task) throw new Error(`Tarea no encontrada: ${taskId}`);

  const before: TaskSnapshot = {
    type: task.type,
    status: task.status,
    plannedDate: iso(task.plannedDate),
    dueDate: iso(task.dueDate),
    assigneeId: task.assigneeId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    completedAt: iso(task.completedAt),
    completedById: task.completedById,
    statusChangedAt: iso(task.statusChangedAt),
    blockedReason: task.blockedReason,
  };

  const changes = diffTaskUpdate(task, input);
  const changedFields = Object.keys(changes);
  const data: Prisma.ActivityUncheckedUpdateInput = {};
  if (changes.type !== undefined) data.type = changes.type;
  if (changes.title !== undefined) data.title = changes.title;
  if (changes.description !== undefined) data.description = changes.description;
  if (changes.priority !== undefined) data.priority = changes.priority;
  if (changes.plannedDate !== undefined) data.plannedDate = changes.plannedDate;
  if (changes.dueDate !== undefined) data.dueDate = changes.dueDate;
  const assigneeChanged = changes.assigneeId !== undefined;
  if (assigneeChanged) data.assigneeId = changes.assigneeId;
  if (changes.completedById !== undefined) {
    data.completedById = changes.completedById;
  }
  if (changes.blockedReason !== undefined) {
    const resultingStatus = changes.status ?? task.status;
    if (resultingStatus !== "blocked" && changes.blockedReason) {
      throw new Error(
        "blockedReason solo se puede guardar cuando la tarea está bloqueada",
      );
    }
    data.blockedReason = changes.blockedReason;
  }

  // Misma semántica que updateActivityStatus (activities/actions.ts).
  if (changes.status) {
    data.status = changes.status;
    data.statusChangedAt = new Date();
    if (changes.status === "done") {
      // Como en la UI, la completa el responsable (el nuevo, si cambia).
      if (changes.completedById === undefined) {
        data.completedById = assigneeChanged
          ? (changes.assigneeId ?? null)
          : task.assigneeId;
      }
      data.completedAt = new Date();
    } else if (task.status === "done") {
      data.completedAt = null;
      data.completedById = null;
    }
    if (changes.status !== "blocked") data.blockedReason = null;
  }

  if (changedFields.length === 0) {
    return {
      taskId,
      before,
      timelineEventIds: [],
      statusChange: null,
      changedFields,
    };
  }

  const updated = await tx.activity.update({
    where: { id: taskId, organizationId: base.organizationId },
    data,
    select: {
      title: true,
      assignee: { select: { name: true } },
      dueDate: true,
      priority: true,
    },
  });

  const timelineBase = {
    organizationId: base.organizationId,
    companyId: task.companyId,
    opportunityId: task.opportunityId,
    refType: "activity",
    refId: taskId,
    actorId: base.actorId,
    metadata: base.metadata,
  };
  const timelineEventIds: string[] = [];
  const pushEvent = (event: { id: string } | null) => {
    if (event) timelineEventIds.push(event.id);
  };

  if (changes.status) {
    pushEvent(
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "task_status_changed",
        title: `Tarea "${updated.title}"`,
        summary: `${statusLabel(task.status)} → ${statusLabel(changes.status)}`,
      }),
    );
  }
  if (assigneeChanged) {
    pushEvent(
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "task_assigned",
        title: `Tarea reasignada: ${updated.title}`,
        summary: updated.assignee
          ? `Asignada a ${updated.assignee.name}`
          : "Sin responsable",
      }),
    );
  }
  const otherChanges = changedFields.filter(
    (field) => field !== "status" && field !== "assigneeId",
  );
  if (otherChanges.length > 0) {
    const parts: string[] = [];
    if (otherChanges.includes("dueDate")) {
      parts.push(
        updated.dueDate
          ? `Vence ${updated.dueDate.toLocaleDateString("es-AR")}`
          : "Sin vencimiento",
      );
    }
    if (otherChanges.includes("plannedDate")) {
      parts.push("Fecha planificada editada");
    }
    if (otherChanges.includes("priority")) {
      parts.push(
        updated.priority
          ? `Prioridad ${ACTIVITY_PRIORITY_LABELS[updated.priority as ActivityPriority] ?? updated.priority}`
          : "Sin prioridad",
      );
    }
    if (otherChanges.includes("title")) parts.push("Título editado");
    if (otherChanges.includes("description")) parts.push("Descripción editada");
    if (otherChanges.includes("type")) parts.push("Tipo editado");
    if (otherChanges.includes("blockedReason")) {
      parts.push("Motivo de bloqueo editado");
    }
    if (otherChanges.includes("completedById")) {
      parts.push("Quién completó la tarea editado");
    }
    pushEvent(
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "task_updated",
        title: `Tarea actualizada: ${updated.title}`,
        summary: parts.join(" · "),
      }),
    );
  }

  return {
    taskId,
    before,
    timelineEventIds,
    statusChange: changes.status
      ? { from: task.status, to: changes.status }
      : null,
    changedFields,
  };
}

export async function revertTaskUpdate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  revert: TaskUpdateRevert,
) {
  const { before } = revert;
  await tx.activity.updateMany({
    where: { id: revert.taskId, organizationId },
    data: {
      ...(before.type !== undefined ? { type: before.type } : {}),
      status: before.status,
      ...(before.plannedDate !== undefined
        ? {
            plannedDate: before.plannedDate
              ? new Date(before.plannedDate)
              : null,
          }
        : {}),
      dueDate: before.dueDate ? new Date(before.dueDate) : null,
      assigneeId: before.assigneeId,
      title: before.title,
      description: before.description,
      priority: before.priority,
      completedAt: before.completedAt ? new Date(before.completedAt) : null,
      completedById: before.completedById,
      statusChangedAt: before.statusChangedAt
        ? new Date(before.statusChangedAt)
        : null,
      blockedReason: before.blockedReason,
    },
  });
  if (revert.timelineEventIds.length > 0) {
    await tx.timelineEvent.deleteMany({
      where: { id: { in: revert.timelineEventIds }, organizationId },
    });
  }
}

// ---------------------------------------------------------------------------
// Ida y vuelta a JSON: afterValue de CRMChangeItem (log_activity,
// create_meeting, update_task) cuando el cambio queda en una propuesta.
// ---------------------------------------------------------------------------

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function requiredDate(value: unknown, field: string): Date {
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida en ${field}`);
  }
  return date;
}

function isLoggedActivityType(value: unknown): value is LoggedActivityType {
  return (LOGGED_ACTIVITY_TYPES as readonly unknown[]).includes(value);
}

export function loggedActivityToJson(
  input: LoggedActivityInput,
): Prisma.InputJsonObject {
  return {
    companyId: input.companyId,
    opportunityId: input.opportunityId,
    personIds: input.personIds,
    activityType: input.type,
    title: input.title,
    occurredAt: input.occurredAt.toISOString(),
    durationMinutes: input.durationMinutes,
    channel: input.channel,
    summary: input.summary,
    outcomes: input.outcomes,
  };
}

export function loggedActivityFromJson(
  after: Record<string, unknown>,
  fallbackCompanyId: string | null,
): LoggedActivityInput {
  const companyId = str(after.companyId) ?? fallbackCompanyId;
  if (!companyId) throw new Error("Actividad sin empresa");
  const duration = Number(after.durationMinutes);
  return {
    companyId,
    opportunityId: str(after.opportunityId),
    personIds: strList(after.personIds),
    type: isLoggedActivityType(after.activityType)
      ? after.activityType
      : "other",
    title: str(after.title) ?? "Actividad",
    occurredAt: requiredDate(after.occurredAt, "occurredAt"),
    durationMinutes:
      after.durationMinutes != null && Number.isFinite(duration)
        ? duration
        : null,
    channel: str(after.channel),
    summary: str(after.summary),
    outcomes: str(after.outcomes),
  };
}

export function manualMeetingToJson(
  input: ManualMeetingInput,
): Prisma.InputJsonObject {
  return {
    companyId: input.companyId,
    opportunityId: input.opportunityId,
    title: input.title,
    meetingType: input.meetingType,
    meetingDate: input.meetingDate.toISOString(),
    participants: normalizeMeetingParticipants(input.participants),
    summary: input.summary,
    keyPoints: input.keyPoints,
    decisions: input.decisions,
    risks: input.risks,
    nextSteps: input.nextSteps,
  };
}

export function manualMeetingFromJson(
  after: Record<string, unknown>,
  fallbackCompanyId: string | null,
): ManualMeetingInput {
  const companyId = str(after.companyId) ?? fallbackCompanyId;
  if (!companyId) throw new Error("Reunión sin empresa");
  const participants = Array.isArray(after.participants)
    ? after.participants.flatMap((entry): MeetingParticipantInput[] => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const name = str(record.name);
        if (!name) return [];
        return [
          {
            name,
            email: str(record.email),
            company: str(record.company),
            role: str(record.role),
            internal:
              typeof record.internal === "boolean" ? record.internal : null,
          },
        ];
      })
    : [];
  return {
    companyId,
    opportunityId: str(after.opportunityId),
    title: str(after.title) ?? "Reunión",
    meetingType: str(after.meetingType) ?? "discovery",
    meetingDate: requiredDate(after.meetingDate, "meetingDate"),
    participants,
    summary: str(after.summary),
    keyPoints: strList(after.keyPoints),
    decisions: strList(after.decisions),
    risks: strList(after.risks),
    nextSteps: strList(after.nextSteps),
  };
}

// Solo viajan las claves que cambian; null significa "vaciar".
export function taskUpdateToJson(
  taskId: string,
  input: TaskUpdateInput,
): Prisma.InputJsonObject {
  return {
    taskId,
    ...(input.type !== undefined ? { activityType: input.type } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.plannedDate !== undefined
      ? { plannedDate: iso(input.plannedDate) }
      : {}),
    ...(input.dueDate !== undefined ? { dueDate: iso(input.dueDate) } : {}),
    ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
    ...(input.completedById !== undefined
      ? { completedById: input.completedById }
      : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.blockedReason !== undefined
      ? { blockedReason: input.blockedReason }
      : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
  };
}

export function taskUpdateFromJson(after: Record<string, unknown>): {
  taskId: string;
  input: TaskUpdateInput;
} {
  const taskId = str(after.taskId);
  if (!taskId) throw new Error("Cambio de tarea sin taskId");
  const input: TaskUpdateInput = {};
  if ("activityType" in after) {
    if (
      typeof after.activityType !== "string" ||
      !(ACTIVITY_TYPES as readonly string[]).includes(after.activityType)
    ) {
      throw new Error(`Tipo de tarea inválido: ${String(after.activityType)}`);
    }
    input.type = after.activityType as ActivityType;
  }
  if ("status" in after) {
    if (typeof after.status !== "string" || !isActivityStatus(after.status)) {
      throw new Error(`Estado de tarea inválido: ${String(after.status)}`);
    }
    input.status = after.status;
  }
  if ("dueDate" in after) {
    input.dueDate =
      after.dueDate == null ? null : requiredDate(after.dueDate, "dueDate");
  }
  if ("plannedDate" in after) {
    input.plannedDate =
      after.plannedDate == null
        ? null
        : requiredDate(after.plannedDate, "plannedDate");
  }
  if ("assigneeId" in after) input.assigneeId = str(after.assigneeId);
  if ("completedById" in after) {
    input.completedById = str(after.completedById);
  }
  if ("title" in after && str(after.title)) input.title = str(after.title)!;
  if ("description" in after) input.description = str(after.description);
  if ("blockedReason" in after) {
    input.blockedReason = str(after.blockedReason);
  }
  if ("priority" in after) {
    const priority = str(after.priority);
    input.priority =
      priority && priority in ACTIVITY_PRIORITY_LABELS
        ? (priority as ActivityPriority)
        : null;
  }
  return { taskId, input };
}
