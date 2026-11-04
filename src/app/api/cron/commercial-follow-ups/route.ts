import { NextResponse, type NextRequest } from "next/server";
import { EntityType, Prisma } from "@prisma/client";
import { prismaSystem } from "@/lib/prisma";
import { forOrg } from "@/lib/tenant";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/internal-auth";
import {
  announceAlerts,
  syncCommercialAlerts,
  type CreatedAlert,
} from "@/lib/commercial/alert-service";
import { dispatchIntegrationEvent, type OrgGatewayConfig } from "@/lib/integrations/gateway";
import { appUrl } from "@/lib/runtime-config";
import { appendTimelineEvent } from "@/lib/timeline";
import { evaluateWorkflows } from "@/lib/workflows/engine";

// Cron comercial (al menos diario): 1) oportunidades pausadas cuya fecha de
// reactivación llegó → tarea de seguimiento para el responsable + evento
// reactivation_due para workflows, idempotente por (externalSource, externalId)
// de la tarea; 2) reconcilia las alertas por etapa y avisa una sola vez por
// alerta nueva. Nunca toca ganadas/perdidas ni cambia el estado (eso es
// decisión humana).
async function runForOrg(org: OrgGatewayConfig) {
  const organizationId = org.id;
  const db = forOrg(organizationId);
  const due = await db.opportunity.findMany({
    where: { status: "paused", reactivateAt: { lte: new Date() } },
    select: { id: true, name: true, companyId: true, ownerId: true, reactivateAt: true, pauseReason: true },
  });
  let created = 0;
  for (const opportunity of due) {
    const reactivateDay = opportunity.reactivateAt!.toISOString().slice(0, 10);
    const assignee = opportunity.ownerId
      ? await db.teamMember.findFirst({ where: { userId: opportunity.ownerId, isActive: true }, select: { id: true } })
      : null;
    try {
      const task = await db.activity.create({
        data: {
          organizationId,
          companyId: opportunity.companyId,
          opportunityId: opportunity.id,
          assigneeId: assignee?.id ?? null,
          type: "follow_up",
          title: `Reevaluar oportunidad pausada: ${opportunity.name}`,
          description: `Llegó la fecha de reactivación (${reactivateDay}). Motivo de la pausa: ${opportunity.pauseReason ?? "—"}`,
          dueDate: new Date(),
          priority: "high",
          status: "todo",
          createdVia: "workflow",
          externalSource: "system",
          externalId: `reactivation:${opportunity.id}:${reactivateDay}`,
        },
        select: { id: true },
      });
      created += 1;
      await appendTimelineEvent(db, {
        organizationId,
        companyId: opportunity.companyId,
        opportunityId: opportunity.id,
        type: "task_created",
        title: "Alerta: llegó la fecha de reactivación",
        summary: `Tarea de seguimiento creada (${reactivateDay}).`,
        refType: "activity",
        refId: task.id,
      });
      await evaluateWorkflows(db, organizationId, {
        entityType: "opportunity",
        entityId: opportunity.id,
        eventName: "reactivation_due",
        after: { status: "paused", reactivateAt: reactivateDay },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  const alerts = await syncCommercialAlerts(db, organizationId);
  await announceAlerts(db, organizationId, alerts.created);
  await notifyAlertRecipients(db, org, alerts.created);
  return {
    checked: due.length,
    created,
    alertsCreated: alerts.created.length,
    alertsResolved: alerts.resolved,
  };
}

// Aviso por email vía gateway. dedupeKey por alerta: nunca un recordatorio
// diario repetido. Sin gateway configurado la alerta queda solo en el CRM.
async function notifyAlertRecipients(
  db: ReturnType<typeof forOrg>,
  org: OrgGatewayConfig,
  alerts: CreatedAlert[],
) {
  if (!org.integrationGatewayUrl && !process.env.INTEGRATION_GATEWAY_URL) return;
  const recipientIds = [
    ...new Set(alerts.flatMap((alert) => (alert.recipientUserId ? [alert.recipientUserId] : []))),
  ];
  if (recipientIds.length === 0) return;
  const users = await db.user.findMany({
    where: { id: { in: recipientIds }, isActive: true },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  for (const alert of alerts) {
    const recipient = alert.recipientUserId ? byId.get(alert.recipientUserId) : undefined;
    if (!recipient) continue;
    const path = alert.entity === "opportunity" ? "opportunities" : "prospecting";
    const url = `${appUrl()}/${path}/${alert.entityId}`;
    await dispatchIntegrationEvent(db, org, {
      type: "commercial.alert",
      channel: "email",
      // EntityType no tiene prospecto: entityId es una referencia lógica.
      entityType: alert.entity === "opportunity" ? EntityType.opportunity : EntityType.company,
      entityId: alert.entity === "opportunity" ? alert.entityId : (alert.companyId ?? alert.entityId),
      recipient: { name: recipient.name, email: recipient.email },
      dedupeKey: `commercial.alert:email:${alert.id}`,
      payload: {
        subject: `Alerta comercial: ${alert.entityName}`,
        text: `${alert.title}\n${alert.reason}\n${url}`,
        ctaUrl: url,
        severity: alert.severity,
      },
    });
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!isCronSecretConfigured(secret)) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const totals = { checked: 0, created: 0, alertsCreated: 0, alertsResolved: 0 };
  const orgs = await prismaSystem.organization.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, integrationGatewayUrl: true, integrationGatewaySecret: true },
  });
  for (const org of orgs) {
    try {
      const result = await runForOrg(org);
      totals.checked += result.checked;
      totals.created += result.created;
      totals.alertsCreated += result.alertsCreated;
      totals.alertsResolved += result.alertsResolved;
    } catch (error) {
      console.error(`[cron] commercial-follow-ups falló para org ${org.slug}`, error);
    }
  }
  return NextResponse.json(totals);
}
