import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prismaSystem } from "@/lib/prisma";
import { forOrg } from "@/lib/tenant";
import { evaluateWorkflows } from "@/lib/workflows/engine";

// Known placeholder values that must never be treated as a valid secret.
const PLACEHOLDER_CRON_SECRETS = new Set([
  "replace-with-a-random-string",
  "changeme",
]);

function isCronSecretConfigured(secret: string | undefined): secret is string {
  return (
    !!secret &&
    secret.length >= 16 &&
    !PLACEHOLDER_CRON_SECRETS.has(secret)
  );
}

function isAuthorized(authHeader: string | null, cronSecret: string) {
  const expected = `Bearer ${cronSecret}`;
  const provided = authHeader ?? "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  // timingSafeEqual throws on length mismatch, so fail fast instead.
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function runForOrg(orgId: string) {
  const db = forOrg(orgId);
  const overdueOpportunities = await db.opportunity.findMany({
    where: { status: "open", nextStepDueDate: { lt: new Date() } },
  });

  let processed = 0;
  for (const opportunity of overdueOpportunities) {
    const existingFollowUp = await db.activity.findFirst({
      where: {
        opportunityId: opportunity.id,
        type: "overdue_follow_up",
        status: "pending",
      },
    });
    if (existingFollowUp) continue;

    await evaluateWorkflows(db, orgId, {
      entityType: "opportunity",
      entityId: opportunity.id,
      eventName: "field_overdue",
      after: { nextStepDueDate: opportunity.nextStepDueDate },
    });
    processed += 1;
  }

  return { checked: overdueOpportunities.length, processed };
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

  const totals = { checked: 0, processed: 0 };
  const orgs = await prismaSystem.organization.findMany({
    where: { isActive: true },
    select: { id: true, slug: true },
  });
  for (const org of orgs) {
    try {
      const result = await runForOrg(org.id);
      totals.checked += result.checked;
      totals.processed += result.processed;
    } catch (error) {
      console.error(`[cron] check-overdue falló para org ${org.slug}`, error);
    }
  }

  return NextResponse.json(totals);
}
