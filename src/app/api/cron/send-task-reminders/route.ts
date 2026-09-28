import { NextResponse, type NextRequest } from "next/server";
import { EntityType } from "@prisma/client";
import { prismaSystem } from "@/lib/prisma";
import { forOrg, type OrgSettings, type TenantClient } from "@/lib/tenant";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";
import { renderNotificationEmail } from "@/lib/integrations/email-template";
import { dispatchIntegrationEvent } from "@/lib/integrations/gateway";
import {
  ACTIVITY_OPEN_STATUSES,
  ACTIVITY_STATUS_LABELS,
  isActivityStatus,
} from "@/lib/activity-status";

const REMINDER_HOUR = 18;
const NOTIFICATION_TYPE = "task.daily_overdue";

function appUrl() {
  return (
    process.env.APP_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

type ZonedClock = {
  day: string;
  hour: number;
};

// Día (YYYY-MM-DD) y hora local de la org. La hora 24 de algunos motores
// al cruzar medianoche se normaliza a 0.
function zonedClock(date: Date, timeZone: string): ZonedClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour"));
  return {
    day: `${value("year")}-${value("month")}-${value("day")}`,
    hour: hour === 24 ? 0 : hour,
  };
}

// Las fechas del formulario se guardan como medianoche UTC
// (`new Date("YYYY-MM-DD")`). Ese día es el que eligió el usuario;
// leerlo en la timezone de la org lo correría un día atrás. Un timestamp
// con hora real sí se interpreta en la timezone de la org.
function activityCalendarDay(date: Date, timeZone: string) {
  const isDateOnly =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  if (isDateOnly) return date.toISOString().slice(0, 10);
  return zonedClock(date, timeZone).day;
}

function formatCalendarDay(day: string, locale: string) {
  const [year, month, date] = day.split("-").map(Number);
  // Mediodía UTC para que el formateo no desplace el día calendario.
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
}

type ReminderActivity = Awaited<
  ReturnType<typeof findOpenDatedActivities>
>[number];

function qualifiesForReminder(
  activity: ReminderActivity,
  today: string,
  timeZone: string,
) {
  const planned = activity.plannedDate
    ? activityCalendarDay(activity.plannedDate, timeZone)
    : null;
  const due = activity.dueDate
    ? activityCalendarDay(activity.dueDate, timeZone)
    : null;
  if (planned === today) return true;
  return due !== null && due <= today;
}

async function findOpenDatedActivities(db: TenantClient) {
  return db.activity.findMany({
    where: {
      status: { in: ACTIVITY_OPEN_STATUSES },
      assigneeId: { not: null },
      OR: [{ plannedDate: { not: null } }, { dueDate: { not: null } }],
    },
    include: {
      assignee: {
        select: { id: true, name: true, email: true, userId: true },
      },
      company: { select: { id: true, name: true } },
      person: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true } },
    },
  });
}

function statusLabel(status: string) {
  return isActivityStatus(status) ? ACTIVITY_STATUS_LABELS[status] : status;
}

function taskContext(activity: ReminderActivity) {
  return [
    activity.company?.name,
    activity.opportunity?.name,
    activity.person
      ? `${activity.person.firstName} ${activity.person.lastName}`
      : null,
  ].filter((part): part is string => Boolean(part));
}

function compareTasks(
  a: ReminderActivity,
  b: ReminderActivity,
  timeZone: string,
) {
  const aDue = a.dueDate
    ? activityCalendarDay(a.dueDate, timeZone)
    : "9999-99-99";
  const bDue = b.dueDate
    ? activityCalendarDay(b.dueDate, timeZone)
    : "9999-99-99";
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  return a.title.localeCompare(b.title, "es");
}

function taskLines(activity: ReminderActivity, org: OrgSettings) {
  const lines = [`Columna: ${statusLabel(activity.status)}`];
  if (activity.plannedDate) {
    lines.push(
      `Planeada: ${formatCalendarDay(activityCalendarDay(activity.plannedDate, org.timezone), org.locale)}`,
    );
  }
  if (activity.dueDate) {
    lines.push(
      `Vence: ${formatCalendarDay(activityCalendarDay(activity.dueDate, org.timezone), org.locale)}`,
    );
  }
  const context = taskContext(activity);
  if (context.length > 0) lines.push(`Contexto: ${context.join(" · ")}`);
  if (activity.status === "blocked" && activity.blockedReason) {
    lines.push(`Bloqueo: ${activity.blockedReason}`);
  }
  return lines;
}

type AssigneeGroup = {
  assignee: NonNullable<ReminderActivity["assignee"]>;
  tasks: ReminderActivity[];
};

function groupByAssignee(activities: ReminderActivity[], timeZone: string) {
  const groups = new Map<string, AssigneeGroup>();
  for (const activity of activities) {
    if (!activity.assignee) continue;
    const existing = groups.get(activity.assignee.id);
    if (existing) {
      existing.tasks.push(activity);
      continue;
    }
    groups.set(activity.assignee.id, {
      assignee: activity.assignee,
      tasks: [activity],
    });
  }
  for (const group of groups.values()) {
    group.tasks.sort((a, b) => compareTasks(a, b, timeZone));
  }
  return [...groups.values()];
}

function buildDigest(group: AssigneeGroup, org: OrgSettings) {
  const assigneeName = group.assignee.name || "Responsable";
  const count = group.tasks.length;
  const subject = `Tareas vencidas de hoy (${count})`;
  const intro = `${assigneeName}, pasadas las 18:00 estas tareas siguen sin estar en Hecha. Este recordatorio las toma como vencidas.`;
  const activityUrl = `${appUrl()}/activities?assignee=me`;
  const blocks = group.tasks.map((activity, index) => {
    const lines = taskLines(activity, org);
    return `${index + 1}. ${activity.title}\n${lines.join("\n")}`;
  });
  const text = `${subject}\n\n${intro}\n\n${blocks.join("\n\n")}\n\nVer en CRM: ${activityUrl}`;
  const tasks = group.tasks.map((activity) => ({
    id: activity.id,
    title: activity.title,
    status: activity.status,
    statusLabel: statusLabel(activity.status),
    plannedDate: activity.plannedDate?.toISOString() ?? null,
    dueDate: activity.dueDate?.toISOString() ?? null,
    blockedReason:
      activity.status === "blocked" ? activity.blockedReason : null,
    companyName: activity.company?.name ?? null,
    personName: activity.person
      ? `${activity.person.firstName} ${activity.person.lastName}`
      : null,
    opportunityName: activity.opportunity?.name ?? null,
  }));

  return {
    subject,
    intro,
    text,
    activityUrl,
    tasks,
    html: renderNotificationEmail({
      brandName: org.brandName ?? org.name,
      accentColor: org.accentColor,
      eyebrow: "Recordatorio de tareas",
      title: "Tareas vencidas de hoy",
      intro,
      statusLabel: "Vencidas",
      statusTone: "danger",
      items: group.tasks.map((activity) => ({
        title: activity.title,
        lines: taskLines(activity, org),
      })),
      details: [
        { label: "Responsable", value: assigneeName },
        { label: "Cantidad", value: String(count) },
      ],
      ctaLabel: "Ver tareas en CRM",
      ctaUrl: activityUrl,
    }),
  };
}

type ReminderResults = {
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
  deferred: number;
};

async function runForOrg(
  org: OrgSettings,
  now: Date,
  results: ReminderResults,
) {
  const clock = zonedClock(now, org.timezone);
  if (clock.hour < REMINDER_HOUR) {
    results.deferred += 1;
    return;
  }

  const db = forOrg(org.id);
  const activities = (await findOpenDatedActivities(db)).filter((activity) =>
    qualifiesForReminder(activity, clock.day, org.timezone),
  );
  results.checked += activities.length;
  if (activities.length === 0) return;

  const groups = groupByAssignee(activities, org.timezone);
  const userIds = [
    ...new Set(
      groups
        .map((group) => group.assignee.userId)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  ];
  const links =
    userIds.length === 0
      ? []
      : await db.telegramLink.findMany({
          where: { userId: { in: userIds }, isActive: true },
          select: { userId: true, telegramChatId: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
        });
  const chatByUserId = new Map<string, string>();
  for (const link of links) {
    if (!chatByUserId.has(link.userId)) {
      chatByUserId.set(link.userId, link.telegramChatId);
    }
  }

  for (const group of groups) {
    const email = group.assignee.email?.trim() || null;
    const chatId = group.assignee.userId
      ? (chatByUserId.get(group.assignee.userId) ?? null)
      : null;
    if (!email && !chatId) {
      results.skipped += 1;
      continue;
    }

    const digest = buildDigest(group, org);
    const entityId = group.tasks[0].id;

    if (email) {
      const result = await dispatchIntegrationEvent(db, org, {
        type: NOTIFICATION_TYPE,
        channel: "email",
        entityType: EntityType.activity,
        entityId,
        recipient: { name: group.assignee.name, email },
        dedupeKey: `${NOTIFICATION_TYPE}:email:${group.assignee.id}:${clock.day}`,
        payload: {
          subject: digest.subject,
          text: digest.text,
          html: digest.html,
          ctaUrl: digest.activityUrl,
          tasks: digest.tasks,
        },
      });
      results[result.status] += 1;
    }

    if (chatId) {
      const result = await dispatchIntegrationEvent(db, org, {
        type: NOTIFICATION_TYPE,
        channel: "telegram",
        entityType: EntityType.activity,
        entityId,
        recipient: { chatId },
        dedupeKey: `${NOTIFICATION_TYPE}:telegram:${group.assignee.id}:${clock.day}`,
        payload: { text: digest.text, tasks: digest.tasks },
      });
      results[result.status] += 1;
    }
  }
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
  const results: ReminderResults = {
    checked: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
  };

  // Un fallo en una org no debe frenar los recordatorios de las demás.
  const orgs = await prismaSystem.organization.findMany({
    where: { isActive: true },
  });
  for (const org of orgs) {
    try {
      await runForOrg(org, now, results);
    } catch (error) {
      console.error(
        `[cron] recordatorios fallaron para org ${org.slug}`,
        error,
      );
    }
  }

  return NextResponse.json(results);
}
