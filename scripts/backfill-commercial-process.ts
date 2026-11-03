import { readFileSync, writeFileSync } from "node:fs";
import { prismaSystem } from "@/lib/prisma";
import { withOrgTransaction } from "@/lib/tenant";
import { recordStageTransition, recordStatusChange } from "@/lib/commercial/history";
import { appendTimelineEvent } from "@/lib/timeline";

// Backfill CONTROLADO del rediseño comercial (HU-CRM-02) para oportunidades
// legacy que quedaron en etapas de prospección (lead_identificado,
// investigacion_realizada, primer_contacto) — marcadas por la migración con
// migrationReview=pending_prospecting_backfill.
//
//   1. npx tsx scripts/backfill-commercial-process.ts --organization-id <id> \
//        --dry-run --output manifest.json
//   2. Revisar el manifiesto: ajustar "action" si corresponde y marcar
//      "reviewed": true solo en los casos aprobados.
//   3. npx tsx scripts/backfill-commercial-process.ts --organization-id <id> \
//        --apply --input manifest.json
//
// Política (verificable en el manifiesto):
// - keep_as_opportunity: hay evidencia de proyecto real (ofertas, reuniones,
//   monto o dolor registrado) → se mueve a Discovery / Sprint 0.
// - convert_to_lead: sin evidencia de proyecto → se crea un CommercialLead
//   (prospect o contacted, sin inventar fechas), se le vinculan actividades y
//   notas (sin quitar el vínculo original) y la oportunidad pasa a
//   status=archived con legacyOpportunityId para trazabilidad. No se borra nada.
// Idempotente: un registro ya procesado se omite.

type Action = "keep_as_opportunity" | "convert_to_lead" | "skip";

type ManifestEntry = {
  opportunityId: string;
  name: string;
  company: string;
  legacyStageKey: string | null;
  evidence: {
    offers: number;
    meetings: number;
    activities: number;
    notes: number;
    estimatedValue: string | null;
    mainPain: boolean;
  };
  recommendation: Action;
  action: Action;
  reviewed: boolean;
};

const PENDING_FLAG = "pending_prospecting_backfill";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function removeFlag(flags: string | null) {
  const rest = (flags ?? "").split(",").filter((flag) => flag && flag !== PENDING_FLAG);
  return rest.length ? rest.join(",") : null;
}

async function dryRun(organizationId: string, output: string) {
  const opportunities = await prismaSystem.opportunity.findMany({
    where: { organizationId, status: "open", migrationReview: { contains: PENDING_FLAG } },
    include: {
      company: { select: { name: true } },
      _count: { select: { commercialOffers: true, meetings: true, activities: true, notes: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const entries: ManifestEntry[] = opportunities.map((opportunity) => {
    const hasProject =
      opportunity._count.commercialOffers > 0 ||
      opportunity._count.meetings > 0 ||
      Boolean(opportunity.estimatedValue && opportunity.estimatedValue.toNumber() > 0) ||
      Boolean(opportunity.mainPain?.trim());
    const recommendation: Action = hasProject ? "keep_as_opportunity" : "convert_to_lead";
    return {
      opportunityId: opportunity.id,
      name: opportunity.name,
      company: opportunity.company.name,
      legacyStageKey: opportunity.legacyStageKey,
      evidence: {
        offers: opportunity._count.commercialOffers,
        meetings: opportunity._count.meetings,
        activities: opportunity._count.activities,
        notes: opportunity._count.notes,
        estimatedValue: opportunity.estimatedValue?.toString() ?? null,
        mainPain: Boolean(opportunity.mainPain?.trim()),
      },
      recommendation,
      action: recommendation,
      reviewed: false,
    };
  });
  writeFileSync(output, JSON.stringify({ organizationId, generatedAt: new Date().toISOString(), entries }, null, 2));
  const summary = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.recommendation] = (acc[entry.recommendation] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[commercial-backfill] dry-run: ${entries.length} oportunidades`, summary, `→ ${output}`);
}

async function apply(organizationId: string, input: string) {
  const manifest = JSON.parse(readFileSync(input, "utf8")) as { organizationId: string; entries: ManifestEntry[] };
  if (manifest.organizationId !== organizationId) {
    throw new Error("El manifiesto pertenece a otra organización.");
  }
  const discovery = await prismaSystem.pipelineStage.findFirst({
    where: { organizationId, key: "reunion_discovery", isActive: true },
    select: { id: true, key: true, label: true },
  });
  if (!discovery) throw new Error("La organización no tiene la etapa reunion_discovery activa.");
  const counts = { kept: 0, converted: 0, skipped: 0, failed: 0 };

  for (const entry of manifest.entries) {
    if (!entry.reviewed || entry.action === "skip") {
      counts.skipped += 1;
      continue;
    }
    try {
      await withOrgTransaction(organizationId, async (tx) => {
        const opportunity = await tx.opportunity.findFirst({
          where: { id: entry.opportunityId, organizationId },
          include: { stage: { select: { key: true, label: true } } },
        });
        // Idempotencia: ya procesada o modificada desde el dry-run.
        if (!opportunity || opportunity.status !== "open" || !opportunity.migrationReview?.includes(PENDING_FLAG)) {
          counts.skipped += 1;
          return;
        }
        const reviewFlags = removeFlag(opportunity.migrationReview);
        if (entry.action === "keep_as_opportunity") {
          await tx.opportunity.update({
            where: { id: opportunity.id, organizationId },
            data: { stageId: discovery.id, migrationReview: reviewFlags },
          });
          await tx.opportunityStageHistory.updateMany({
            where: { organizationId, opportunityId: opportunity.id, exitedAt: null },
            data: { exitedAt: new Date() },
          });
          await recordStageTransition(tx, {
            organizationId,
            opportunityId: opportunity.id,
            stage: discovery,
            actorId: null,
            source: "migration",
            reason: "Backfill controlado: evidencia de proyecto, se mantiene como oportunidad.",
          });
          await appendTimelineEvent(tx, {
            organizationId,
            companyId: opportunity.companyId,
            opportunityId: opportunity.id,
            type: "legacy_migration",
            title: "Migración: se mantiene como oportunidad",
            summary: `${opportunity.stage.label} → ${discovery.label}`,
            refType: "migration",
            refId: "backfill-commercial-process",
          });
          counts.kept += 1;
          return;
        }

        const existing = await tx.commercialLead.findFirst({
          where: { organizationId, legacyOpportunityId: opportunity.id },
          select: { id: true },
        });
        if (existing) {
          counts.skipped += 1;
          return;
        }
        const status = opportunity.legacyStageKey === "primer_contacto" ? "contacted" : "prospect";
        const lead = await tx.commercialLead.create({
          data: {
            organizationId,
            title: opportunity.name,
            companyId: opportunity.companyId,
            personId: opportunity.decisionMakerId ?? opportunity.sponsorId,
            status,
            ownerId: opportunity.ownerId,
            description: opportunity.mainPain,
            // Fecha real de identificación: cuando se creó el registro legacy.
            identifiedAt: opportunity.createdAt,
            nextStep: opportunity.nextStep,
            nextStepDueDate: opportunity.nextStepDueDate,
            firstTouchAttributionId: opportunity.firstTouchAttributionId,
            lastTouchAttributionId: opportunity.firstTouchAttributionId,
            legacyOpportunityId: opportunity.id,
            createdVia: "migration",
          },
          select: { id: true },
        });
        // Vínculo aditivo: actividades y notas quedan también en el lead.
        await tx.activity.updateMany({ where: { organizationId, opportunityId: opportunity.id }, data: { commercialLeadId: lead.id } });
        await tx.note.updateMany({ where: { organizationId, opportunityId: opportunity.id }, data: { commercialLeadId: lead.id } });
        await tx.opportunity.update({
          where: { id: opportunity.id, organizationId },
          data: { status: "archived", statusChangedAt: new Date(), migrationReview: reviewFlags },
        });
        await tx.opportunityStageHistory.updateMany({
          where: { organizationId, opportunityId: opportunity.id, exitedAt: null },
          data: { exitedAt: new Date() },
        });
        await recordStatusChange(tx, {
          organizationId,
          entityType: "commercial_lead",
          entityId: lead.id,
          fromValue: null,
          toValue: status,
          actorId: null,
          source: "migration",
          metadata: { legacyOpportunityId: opportunity.id },
        });
        await recordStatusChange(tx, {
          organizationId,
          entityType: "opportunity",
          entityId: opportunity.id,
          fromValue: "open",
          toValue: "archived",
          actorId: null,
          source: "migration",
          reason: "Convertida a prospecto por el backfill controlado",
          metadata: { commercialLeadId: lead.id },
        });
        await appendTimelineEvent(tx, {
          organizationId,
          companyId: opportunity.companyId,
          opportunityId: opportunity.id,
          type: "legacy_migration",
          title: "Migración: convertida en prospecto",
          summary: `Etapa legacy ${opportunity.stage.label}; la historia sigue accesible desde el prospecto.`,
          refType: "commercial_lead",
          refId: lead.id,
        });
        counts.converted += 1;
      });
    } catch (error) {
      counts.failed += 1;
      console.error(`[commercial-backfill] ${entry.opportunityId} falló`, error);
    }
  }
  console.log("[commercial-backfill] apply", counts);
}

async function main() {
  const organizationId = arg("organization-id");
  if (!organizationId) throw new Error("Falta --organization-id");
  if (process.argv.includes("--dry-run")) {
    await dryRun(organizationId, arg("output") ?? "commercial-backfill-manifest.json");
  } else if (process.argv.includes("--apply")) {
    const input = arg("input");
    if (!input) throw new Error("Falta --input manifest.json");
    await apply(organizationId, input);
  } else {
    throw new Error("Usa --dry-run o --apply");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prismaSystem.$disconnect());
