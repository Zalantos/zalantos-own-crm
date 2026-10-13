import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import {
  extractCommercialOffer,
  extractedCommercialOfferSchema,
  extractionConfidence,
  fingerprintCommercialSources,
} from "../src/lib/commercial/backfill";

const sourceRefSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  preview: z.string(),
});

const manifestItemSchema = z.object({
  opportunityId: z.string(),
  opportunityName: z.string(),
  companyId: z.string(),
  companyName: z.string(),
  result: z.enum(["ready", "needs_review", "no_source", "error"]),
  reviewed: z.boolean().default(false),
  sourceFingerprint: z.string().nullable(),
  sourceRefs: z.array(sourceRefSchema),
  confidence: z.number().min(0).max(1),
  extracted: extractedCommercialOfferSchema.nullable(),
  reviewNotes: z.string().nullable().default(null),
  confirmedPartnerId: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  organizationId: z.string(),
  generatedAt: z.string(),
  items: z.array(manifestItemSchema),
  totals: z.record(z.string(), z.number()),
});

type ManifestItem = z.infer<typeof manifestItemSchema>;

const connectionString =
  process.env.DATABASE_URL_SYSTEM ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está configurada.");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireArgument(name: string) {
  const value = argument(name);
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function useful(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text.length >= 20 ? text : null;
}

function source(
  id: string,
  type: string,
  label: string,
  value: string | null | undefined,
) {
  const text = useful(value);
  return text ? { id, type, label, text } : null;
}

function mentionsOpportunity(text: string, opportunityName: string) {
  const haystack = text.toLocaleLowerCase("es");
  const tokens = opportunityName
    .toLocaleLowerCase("es")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 4);
  return tokens.length > 0 && tokens.some((token) => haystack.includes(token));
}

async function buildManifest(organizationId: string) {
  const opportunities = await prisma.opportunity.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          description: true,
          mainPain: true,
          _count: { select: { opportunities: true } },
        },
      },
      notes: { orderBy: { createdAt: "asc" } },
      meetings: {
        orderBy: { meetingDate: "asc" },
        include: { evidence: { orderBy: { uploadedAt: "asc" } } },
      },
    },
  });
  const opportunityIds = opportunities.map((opportunity) => opportunity.id);
  const contextSources = await prisma.entityContextSource.findMany({
    where: {
      organizationId,
      entityType: "opportunity",
      entityId: { in: opportunityIds },
    },
    orderBy: { createdAt: "asc" },
  });
  const contextByOpportunity = new Map<string, typeof contextSources>();
  for (const contextSource of contextSources) {
    const current = contextByOpportunity.get(contextSource.entityId) ?? [];
    current.push(contextSource);
    contextByOpportunity.set(contextSource.entityId, current);
  }

  const items: ManifestItem[] = [];
  for (const opportunity of opportunities) {
    try {
      const sources = [
        ...(contextByOpportunity.get(opportunity.id) ?? []).map((entry) =>
          source(
            `context:${entry.id}`,
            "context_source",
            entry.filename,
            entry.extractedText,
          ),
        ),
        ...opportunity.notes.map((note) =>
          source(
            `note:${note.id}`,
            "note",
            note.title ?? "Nota sin título",
            note.body,
          ),
        ),
        ...opportunity.meetings.flatMap((meeting) => [
          source(
            `meeting:${meeting.id}:transcript`,
            "meeting_transcript",
            meeting.title,
            meeting.rawTranscript,
          ),
          source(
            `meeting:${meeting.id}:summary`,
            "meeting_summary",
            meeting.title,
            meeting.aiSummary ? JSON.stringify(meeting.aiSummary) : null,
          ),
          ...meeting.evidence.map((evidence) =>
            source(
              `evidence:${evidence.id}`,
              "meeting_evidence",
              evidence.filename,
              evidence.extractedText,
            ),
          ),
        ]),
        source(
          `opportunity:${opportunity.id}:mainPain`,
          "opportunity_main_pain",
          "Dolor principal de la oportunidad",
          opportunity.mainPain,
        ),
      ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      const companyText = [
        opportunity.company.description,
        opportunity.company.mainPain,
      ]
        .filter(Boolean)
        .join("\n");
      if (
        useful(companyText) &&
        (opportunity.company._count.opportunities === 1 ||
          mentionsOpportunity(companyText, opportunity.name))
      ) {
        const companySource = source(
          `company:${opportunity.company.id}:commercial-text`,
          "company_fallback",
          "Descripción y dolor de empresa",
          companyText,
        );
        if (companySource) sources.push(companySource);
      }

      if (sources.length === 0) {
        items.push({
          opportunityId: opportunity.id,
          opportunityName: opportunity.name,
          companyId: opportunity.company.id,
          companyName: opportunity.company.name,
          result: "no_source",
          reviewed: false,
          sourceFingerprint: null,
          sourceRefs: [],
          confidence: 0,
          extracted: null,
          reviewNotes: null,
          confirmedPartnerId: null,
          error: null,
        });
        continue;
      }

      const joined = sources
        .map((entry) => `FUENTE ${entry.label}\n${entry.text}`)
        .join("\n\n");
      const extracted = extractCommercialOffer(joined);
      const confidence = extractionConfidence(extracted);
      const hasCommercialEvidence =
        extracted.economicBaseNetAmount !== null ||
        extracted.lineItems.length > 0 ||
        [
          extracted.solutionSummary,
          extracted.implementationPlan,
          extracted.commercialTerms,
        ].filter(Boolean).length >= 2;
      items.push({
        opportunityId: opportunity.id,
        opportunityName: opportunity.name,
        companyId: opportunity.company.id,
        companyName: opportunity.company.name,
        result:
          hasCommercialEvidence && confidence >= 0.5 ? "ready" : "needs_review",
        reviewed: false,
        sourceFingerprint: fingerprintCommercialSources(
          opportunity.id,
          sources,
        ),
        sourceRefs: sources.map((entry) => ({
          id: entry.id,
          type: entry.type,
          label: entry.label,
          preview: entry.text.replace(/\s+/g, " ").slice(0, 300),
        })),
        confidence,
        extracted,
        reviewNotes: null,
        confirmedPartnerId: null,
        error: null,
      });
    } catch (error) {
      items.push({
        opportunityId: opportunity.id,
        opportunityName: opportunity.name,
        companyId: opportunity.company.id,
        companyName: opportunity.company.name,
        result: "error",
        reviewed: false,
        sourceFingerprint: null,
        sourceRefs: [],
        confidence: 0,
        extracted: null,
        reviewNotes: null,
        confirmedPartnerId: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const totals = Object.fromEntries(
    ["ready", "needs_review", "no_source", "error"].map((result) => [
      result,
      items.filter((item) => item.result === result).length,
    ]),
  );
  return manifestSchema.parse({
    schemaVersion: 1,
    organizationId,
    generatedAt: new Date().toISOString(),
    items,
    totals,
  });
}

async function applyManifest(organizationId: string, inputPath: string) {
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(resolve(inputPath), "utf8")),
  );
  if (manifest.organizationId !== organizationId) {
    throw new Error("El manifiesto pertenece a otra organización.");
  }
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (!organization) throw new Error("Organización no encontrada.");

  const report: Array<{
    opportunityId: string;
    status: "applied" | "skipped" | "error";
    detail: string;
  }> = [];
  for (const item of manifest.items) {
    if (!item.reviewed || !item.extracted || !item.sourceFingerprint) {
      report.push({
        opportunityId: item.opportunityId,
        status: "skipped",
        detail: "No revisado o sin extracción aplicable.",
      });
      continue;
    }
    try {
      const existing = await prisma.commercialOffer.findUnique({
        where: {
          organizationId_sourceFingerprint: {
            organizationId,
            sourceFingerprint: item.sourceFingerprint,
          },
        },
        select: { id: true },
      });
      if (existing) {
        report.push({
          opportunityId: item.opportunityId,
          status: "skipped",
          detail: `Ya aplicado en ${existing.id}.`,
        });
        continue;
      }

      const opportunity = await prisma.opportunity.findFirst({
        where: { id: item.opportunityId, organizationId },
        select: {
          id: true,
          companyId: true,
          commercialPartners: { select: { commercialPartnerId: true } },
        },
      });
      if (!opportunity)
        throw new Error("Oportunidad no encontrada en el tenant.");
      if (
        item.confirmedPartnerId &&
        !opportunity.commercialPartners.some(
          (assignment) =>
            assignment.commercialPartnerId === item.confirmedPartnerId,
        )
      ) {
        throw new Error(
          "El partner confirmado no está asignado a la oportunidad.",
        );
      }

      const extracted = item.extracted;
      const offerId = await prisma.$transaction(async (tx) => {
        const latest = await tx.commercialOffer.findFirst({
          where: { organizationId, opportunityId: opportunity.id },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const requestedVersion = extracted.versionNumber ?? 1;
        const versionNumber = Math.max(
          requestedVersion,
          (latest?.versionNumber ?? 0) + 1,
        );
        const offer = await tx.commercialOffer.create({
          data: {
            organizationId,
            opportunityId: opportunity.id,
            versionNumber,
            status: extracted.status,
            offerorName: extracted.offerorName,
            presenterNameSnapshot: extracted.presenterNameSnapshot,
            productName: extracted.productName,
            sentAt: extracted.sentAt ? new Date(extracted.sentAt) : null,
            validBusinessDays: extracted.validBusinessDays,
            validUntil: extracted.validUntil
              ? new Date(extracted.validUntil)
              : null,
            pricingUnit: extracted.pricingUnit,
            plusVat: extracted.plusVat,
            executiveSummary: extracted.executiveSummary,
            painSummary: extracted.painSummary,
            solutionSummary: extracted.solutionSummary,
            implementationPlan: extracted.implementationPlan,
            outOfScope: extracted.outOfScope,
            commercialTerms: extracted.commercialTerms,
            risks: extracted.risks,
            nextSteps: extracted.nextSteps,
            economicScope: extracted.economicScope,
            economicScopeLabel: extracted.economicScopeLabel,
            economicBaseNetAmount: extracted.economicBaseNetAmount,
            projectCostAmount: null,
            distributableProfitAmount: null,
            createdVia: "backfill",
            sourceFingerprint: item.sourceFingerprint,
            sourceRefs: item.sourceRefs as Prisma.InputJsonValue,
            extractionConfidence: item.confidence,
          },
        });
        if (extracted.lineItems.length > 0) {
          await tx.commercialOfferLineItem.createMany({
            data: extracted.lineItems.map((line, index) => ({
              organizationId,
              commercialOfferId: offer.id,
              type: line.type,
              description: line.description,
              amount: line.amount,
              pricingUnit: line.pricingUnit,
              frequency: line.frequency,
              sortOrder: index,
            })),
          });
        }
        if (extracted.documents.length > 0) {
          await tx.commercialOfferDocument.createMany({
            data: extracted.documents.map((document) => ({
              organizationId,
              commercialOfferId: offer.id,
              name: document.name,
              externalUrl: document.externalUrl,
              notes: "Extraído durante backfill; revisar ubicación y versión.",
            })),
          });
        }
        await tx.commercialOfferProfitShare.create({
          data: {
            organizationId,
            commercialOfferId: offer.id,
            beneficiaryType: "organization",
            beneficiaryNameSnapshot: organization.name,
            percentage: 100,
            amount: 0,
          },
        });
        await tx.timelineEvent.create({
          data: {
            organizationId,
            companyId: opportunity.companyId,
            opportunityId: opportunity.id,
            type: "commercial_offer_backfilled",
            title: `Oferta comercial v${versionNumber} recuperada`,
            summary: `Backfill desde ${item.sourceRefs.length} fuente(s), confianza ${item.confidence}.`,
            refType: "commercial_offer",
            refId: offer.id,
            metadata: {
              sourceFingerprint: item.sourceFingerprint,
              reviewed: item.reviewed,
            },
          },
        });
        return offer.id;
      });
      report.push({
        opportunityId: item.opportunityId,
        status: "applied",
        detail: offerId,
      });
    } catch (error) {
      report.push({
        opportunityId: item.opportunityId,
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return report;
}

async function main() {
  const organizationId = requireArgument("--organization-id");
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  if (dryRun === apply) {
    throw new Error("Usa exactamente uno de --dry-run o --apply.");
  }
  if (dryRun) {
    const output = requireArgument("--output");
    const manifest = await buildManifest(organizationId);
    await writeFile(
      resolve(output),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    console.log(
      JSON.stringify({ output: resolve(output), ...manifest.totals }, null, 2),
    );
    return;
  }
  const input = requireArgument("--input");
  const report = await applyManifest(organizationId, input);
  console.log(JSON.stringify(report, null, 2));
  if (report.some((entry) => entry.status === "error")) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
