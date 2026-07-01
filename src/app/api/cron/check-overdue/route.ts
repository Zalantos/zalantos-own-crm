import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
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

  const overdueOpportunities = await prisma.opportunity.findMany({
    where: { status: "open", nextStepDueDate: { lt: new Date() } },
  });

  let processed = 0;
  for (const opportunity of overdueOpportunities) {
    const existingFollowUp = await prisma.activity.findFirst({
      where: {
        opportunityId: opportunity.id,
        type: "overdue_follow_up",
        status: "pending",
      },
    });
    if (existingFollowUp) continue;

    await evaluateWorkflows({
      entityType: "opportunity",
      entityId: opportunity.id,
      eventName: "field_overdue",
      after: { nextStepDueDate: opportunity.nextStepDueDate },
    });
    processed += 1;
  }

  return NextResponse.json({
    checked: overdueOpportunities.length,
    processed,
  });
}
