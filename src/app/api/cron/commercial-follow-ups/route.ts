import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prismaSystem } from "@/lib/prisma";
import { forOrg } from "@/lib/tenant";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";
import { appendTimelineEvent } from "@/lib/timeline";
import { evaluateWorkflows } from "@/lib/workflows/engine";

// Cron diario: oportunidades pausadas cuya fecha de reactivación llegó →
// tarea de seguimiento para el responsable + evento reactivation_due para
// workflows. Idempotente por (externalSource, externalId) de la tarea: una
// sola alerta por oportunidad y fecha de reactivación. Nunca toca
// ganadas/perdidas ni cambia el estado (eso es decisión humana).
async function runForOrg(organizationId: string) {
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
  return { checked: due.length, created };
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!isCronSecretConfigured(secret)) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const totals = { checked: 0, created: 0 };
  const orgs = await prismaSystem.organization.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
  for (const org of orgs) {
    try {
      const result = await runForOrg(org.id);
      totals.checked += result.checked;
      totals.created += result.created;
    } catch (error) {
      console.error(`[cron] commercial-follow-ups falló para org ${org.slug}`, error);
    }
  }
  return NextResponse.json(totals);
}
