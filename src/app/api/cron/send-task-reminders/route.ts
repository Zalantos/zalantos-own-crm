import { NextResponse, type NextRequest } from "next/server";
import { EntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";
import { renderNotificationEmail } from "@/lib/integrations/email-template";
import { dispatchIntegrationEvent } from "@/lib/integrations/gateway";

const DAY_MS = 86_400_000;

function appUrl() {
  return (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000")
    .replace(/\/$/, "");
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeZone: "America/Santiago",
  }).format(date);
}

type ReminderActivity = Awaited<
  ReturnType<typeof findReminderActivities>
>[number];

async function findReminderActivities(now: Date, dueSoonLimit: Date) {
  return prisma.activity.findMany({
    where: {
      status: "pending",
      dueDate: { not: null, lt: dueSoonLimit },
      assignee: { is: { email: { not: null } } },
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true } },
      person: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });
}

function reminderType(activity: ReminderActivity, now: Date) {
  if (!activity.dueDate) return null;
  return activity.dueDate < now ? "task.overdue" : "task.due_soon";
}

function buildReminderPayload(activity: ReminderActivity, type: string) {
  const baseUrl = appUrl();
  const dueDate = activity.dueDate;
  const dueLabel = dueDate ? formatDate(dueDate) : "sin fecha";
  const isOverdue = type === "task.overdue";
  const assigneeName = activity.assignee?.name ?? "Responsable";
  const context = [
    activity.company?.name,
    activity.opportunity?.name,
    activity.person
      ? `${activity.person.firstName} ${activity.person.lastName}`
      : null,
  ].filter(Boolean);
  const contextText = context.length > 0 ? `\nContexto: ${context.join(" · ")}` : "";
  const activityUrl = `${baseUrl}/activities?assignee=me`;
  const subject = isOverdue
    ? `Tarea vencida: ${activity.title}`
    : `Tarea por vencer: ${activity.title}`;
  const intro = isOverdue
    ? `${assigneeName}, esta tarea asignada a ti ya esta vencida. Conviene revisarla para no perder el seguimiento.`
    : `${assigneeName}, esta tarea asignada a ti vence dentro de las proximas 24 horas.`;
  const description = activity.description
    ? `\nDescripcion: ${activity.description}`
    : "";
  const text = `${subject}\n\n${intro}\n\nVence: ${dueLabel}${contextText}${description}\n\nVer en CRM: ${activityUrl}`;

  return {
    subject,
    text,
    html: renderNotificationEmail({
      eyebrow: "Recordatorio de tarea",
      title: activity.title,
      intro,
      statusLabel: isOverdue ? "Vencida" : "Vence pronto",
      statusTone: isOverdue ? "danger" : "warning",
      details: [
        { label: "Fecha de vencimiento", value: dueLabel },
        { label: "Responsable", value: assigneeName },
        { label: "Empresa", value: activity.company?.name },
        { label: "Oportunidad", value: activity.opportunity?.name },
        {
          label: "Persona",
          value: activity.person
            ? `${activity.person.firstName} ${activity.person.lastName}`
            : null,
        },
        { label: "Descripcion", value: activity.description },
      ],
      ctaLabel: "Ver tarea en CRM",
      ctaUrl: activityUrl,
    }),
    ctaUrl: activityUrl,
    task: {
      id: activity.id,
      title: activity.title,
      type: activity.type,
      dueDate: dueDate?.toISOString() ?? null,
      description: activity.description,
      companyName: activity.company?.name ?? null,
      personName: activity.person
        ? `${activity.person.firstName} ${activity.person.lastName}`
        : null,
      opportunityName: activity.opportunity?.name ?? null,
    },
  };
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!isCronSecretConfigured(cronSecret)) {
    console.error(
      "[cron] CRON_SECRET no está configurado o usa un valor de ejemplo. Rechazando la solicitud.",
    );
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = dayKey(now);
  const dueSoonLimit = new Date(now.getTime() + DAY_MS);
  const activities = await findReminderActivities(now, dueSoonLimit);

  const results = {
    checked: activities.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const activity of activities) {
    const type = reminderType(activity, now);
    if (!type || !activity.assignee?.email) continue;

    const result = await dispatchIntegrationEvent({
      type,
      channel: "email",
      entityType: EntityType.activity,
      entityId: activity.id,
      recipient: {
        name: activity.assignee.name,
        email: activity.assignee.email,
      },
      dedupeKey: `${type}:${activity.id}:${today}:${activity.assignee.id}`,
      payload: buildReminderPayload(activity, type),
    });

    results[result.status] += 1;
  }

  return NextResponse.json(results);
}
