import type { Prisma } from "@prisma/client";
import { withOrgTransaction, type TenantClient } from "@/lib/tenant";
import { getObjectBuffer } from "@/lib/meeting-intelligence/storage/r2";
import {
  classifyEvidence,
  extractText,
} from "@/lib/meeting-intelligence/extraction";
import { dedupeContactItems } from "@/lib/meeting-intelligence/dedup-items";
import { appendTimelineEvent } from "@/lib/timeline";
import { analyzeEntityContext } from "@/lib/entity-context/analyze";
import {
  buildContextNoteBody,
  mapEnrichmentToItems,
} from "@/lib/entity-context/mapping";
import { buildEntityContextSnapshot } from "@/lib/entity-context/snapshot";
import { resolveContextEntity } from "@/lib/entity-context/resolve-entity";
import {
  isContextEntityType,
  type ContextEntityType,
  type ContextKeyFact,
} from "@/lib/entity-context/types";

async function upsertContextNote(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    entityType: ContextEntityType;
    entityId: string;
    companyId: string | null;
    opportunityId: string | null;
    personId: string | null;
    title: string;
    body: string;
    actorId: string | null;
  },
) {
  const where =
    params.entityType === "company"
      ? { companyId: params.entityId, createdVia: "enrichment" }
      : params.entityType === "person"
        ? { personId: params.entityId, createdVia: "enrichment" }
        : { opportunityId: params.entityId, createdVia: "enrichment" };

  const existing = await tx.note.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    await tx.note.update({
      where: { id: existing.id },
      data: { title: params.title, body: params.body },
    });
    return existing.id;
  }

  const created = await tx.note.create({
    data: {
      organizationId: params.organizationId,
      companyId:
        params.entityType === "company"
          ? params.entityId
          : params.companyId,
      personId:
        params.entityType === "person" ? params.entityId : params.personId,
      opportunityId:
        params.entityType === "opportunity"
          ? params.entityId
          : params.opportunityId,
      title: params.title,
      body: params.body,
      createdById: params.actorId,
      createdVia: "enrichment",
    },
  });
  return created.id;
}

// Extract → analyze → auto profile/note → propose field updates.
// Safe to re-run: skips extraction when extractedText already exists.
export async function runEntityContextPipeline(
  db: TenantClient,
  organizationId: string,
  sourceId: string,
): Promise<void> {
  const source = await db.entityContextSource.findUnique({
    where: { id: sourceId },
  });
  if (!source) throw new Error(`Fuente de contexto no encontrada: ${sourceId}`);
  if (!isContextEntityType(source.entityType)) {
    throw new Error(`Tipo de entidad no soportado: ${source.entityType}`);
  }

  const entityType = source.entityType;
  const resolved = await resolveContextEntity(db, entityType, source.entityId);
  if (!resolved) {
    throw new Error(`Entidad no encontrada: ${entityType}/${source.entityId}`);
  }

  try {
    // --- Extract ---
    await db.entityContextSource.update({
      where: { id: sourceId },
      data: { status: "extracting", processingError: null },
    });

    let extractedText = source.extractedText ?? "";
    if (!extractedText.trim()) {
      if (!source.storagePath) {
        throw new Error("La fuente no tiene texto ni archivo en storage.");
      }
      const { type, kind } = classifyEvidence(source.filename, source.mimeType);
      if (kind !== "text") {
        throw new Error(
          "Solo se admiten documentos de texto (PDF, DOCX, TXT, MD) en contexto de entidad.",
        );
      }
      const buffer = await getObjectBuffer(source.storagePath);
      extractedText = await extractText(type, buffer);
      await db.entityContextSource.update({
        where: { id: sourceId },
        data: { extractedText, status: "extracted" },
      });
    }

    if (!extractedText.trim()) {
      throw new Error("No se pudo extraer texto de la fuente.");
    }

    // Include sibling ready sources so the profile consolidates across uploads.
    const siblingSources = await db.entityContextSource.findMany({
      where: {
        entityType,
        entityId: source.entityId,
        OR: [
          { id: sourceId },
          { status: "ready", extractedText: { not: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, filename: true, extractedText: true },
    });

    const combined = siblingSources
      .filter((item) => item.extractedText?.trim())
      .map((item) => `# ${item.filename}\n${item.extractedText}`)
      .join("\n\n");

    // --- Analyze ---
    await db.entityContextSource.update({
      where: { id: sourceId },
      data: { status: "analyzing" },
    });

    const snapshot = await buildEntityContextSnapshot(
      db,
      entityType,
      source.entityId,
    );
    const { analysis, model, raw } = await analyzeEntityContext({
      entityType,
      snapshot,
      sourceText: combined || extractedText,
    });

    const keyFacts: ContextKeyFact[] = analysis.key_facts.map((fact) => ({
      label: fact.label,
      value: fact.value,
      confidence: fact.confidence,
      sourceIds: [sourceId],
    }));

    const mapped = mapEnrichmentToItems(analysis, {
      entityType,
      entityId: source.entityId,
      companyId: resolved.companyId,
    });

    const items =
      resolved.companyId && mapped.some((item) => item.type === "add_contact")
        ? await dedupeContactItems(
            db,
            organizationId,
            resolved.companyId,
            mapped,
          )
        : mapped;

    const notePayload = buildContextNoteBody(analysis);

    await withOrgTransaction(organizationId, async (tx) => {
      await tx.entityContextProfile.upsert({
        where: {
          organizationId_entityType_entityId: {
            organizationId,
            entityType,
            entityId: source.entityId,
          },
        },
        create: {
          organizationId,
          entityType,
          entityId: source.entityId,
          summary: analysis.summary.trim() || "Sin resumen disponible.",
          keyFacts: keyFacts as unknown as Prisma.InputJsonValue,
          topics: analysis.topics as unknown as Prisma.InputJsonValue,
          lastAnalyzedAt: new Date(),
          model,
          rawModelOutput: raw as unknown as Prisma.InputJsonValue,
        },
        update: {
          summary: analysis.summary.trim() || "Sin resumen disponible.",
          keyFacts: keyFacts as unknown as Prisma.InputJsonValue,
          topics: analysis.topics as unknown as Prisma.InputJsonValue,
          lastAnalyzedAt: new Date(),
          model,
          rawModelOutput: raw as unknown as Prisma.InputJsonValue,
        },
      });

      if (notePayload) {
        await upsertContextNote(tx, {
          organizationId,
          entityType,
          entityId: source.entityId,
          companyId: resolved.companyId,
          opportunityId: resolved.opportunityId,
          personId: resolved.personId,
          title: notePayload.title,
          body: notePayload.body,
          actorId: source.uploadedBy,
        });
      }

      // Enrichment proposals always stay pending (hybrid policy).
      if (items.length > 0) {
        await tx.cRMChangeProposal.create({
          data: {
            organizationId,
            source: "enrichment",
            companyId: resolved.companyId,
            opportunityId: resolved.opportunityId,
            personId: resolved.personId,
            contextSourceId: sourceId,
            confidence: analysis.confidence,
            model,
            rawModelOutput: raw as unknown as Prisma.InputJsonValue,
            items: {
              create: items.map((item) => ({
                organizationId,
                type: item.type,
                entity: item.entity,
                entityId: item.entityId,
                beforeValue: (item.beforeValue ??
                  undefined) as Prisma.InputJsonValue,
                afterValue: (item.afterValue ??
                  undefined) as Prisma.InputJsonValue,
                confidence: item.confidence,
                explanation: item.explanation,
                evidence: item.evidence || null,
                duplicateOfId: item.duplicateOfId ?? null,
                approved: false,
                status: "pending",
              })),
            },
          },
        });
      }

      await tx.entityContextSource.update({
        where: { id: sourceId },
        data: { status: "ready", processingError: null },
      });

      if (resolved.companyId) {
        await appendTimelineEvent(tx, {
          organizationId,
          companyId: resolved.companyId,
          opportunityId: resolved.opportunityId,
          type: "context_enriched",
          title: `Contexto enriquecido: ${source.filename}`,
          summary: analysis.summary.trim() || null,
          refType: "entity_context_source",
          refId: sourceId,
          actorId: source.uploadedBy,
        });
      }
    });
  } catch (error) {
    await db.entityContextSource.update({
      where: { id: sourceId },
      data: {
        status: "failed",
        processingError:
          error instanceof Error ? error.message : "Error desconocido",
      },
    });
    throw error;
  }
}
