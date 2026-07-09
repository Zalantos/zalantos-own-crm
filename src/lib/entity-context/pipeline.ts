import type { EntityContextSource, Prisma } from "@prisma/client";
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

function describeBatch(sources: { filename: string }[]): string {
  if (sources.length === 1) return sources[0].filename;
  return `${sources[0].filename} y ${sources.length - 1} documento${sources.length > 2 ? "s" : ""} más`;
}

async function markSourcesFailed(
  db: TenantClient,
  sourceIds: string[],
  error: unknown,
): Promise<void> {
  if (sourceIds.length === 0) return;
  await db.entityContextSource.updateMany({
    where: { id: { in: sourceIds } },
    data: {
      status: "failed",
      processingError:
        error instanceof Error ? error.message : "Error desconocido",
    },
  });
}

// Extrae el texto de una fuente si aún no lo tiene. Devuelve el texto o null
// si la extracción falló (la fuente queda marcada como failed).
async function extractSourceText(
  db: TenantClient,
  source: EntityContextSource,
): Promise<string | null> {
  const existing = source.extractedText ?? "";
  if (existing.trim()) return existing;

  try {
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
    const extractedText = await extractText(type, buffer);
    if (!extractedText.trim()) {
      throw new Error("No se pudo extraer texto de la fuente.");
    }
    await db.entityContextSource.update({
      where: { id: source.id },
      data: { extractedText, status: "extracted" },
    });
    return extractedText;
  } catch (error) {
    await markSourcesFailed(db, [source.id], error);
    return null;
  }
}

// Extract → analyze → auto profile/note → propose field updates.
// Acepta un lote de fuentes de la misma entidad: extrae cada archivo por
// separado y corre UN solo análisis consolidado (un perfil, una nota y una
// propuesta por lote, en lugar de una por archivo).
// Safe to re-run: skips extraction when extractedText already exists.
export async function runEntityContextPipeline(
  db: TenantClient,
  organizationId: string,
  sourceIds: string[],
): Promise<void> {
  const ids = [...new Set(sourceIds)];
  if (ids.length === 0) {
    throw new Error("Se requiere al menos una fuente de contexto.");
  }

  const sources = await db.entityContextSource.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "asc" },
  });
  if (sources.length === 0) {
    throw new Error(`Fuentes de contexto no encontradas: ${ids.join(", ")}`);
  }

  const [first] = sources;
  if (!isContextEntityType(first.entityType)) {
    throw new Error(`Tipo de entidad no soportado: ${first.entityType}`);
  }
  const entityType = first.entityType;
  const entityId = first.entityId;
  if (
    sources.some(
      (item) => item.entityType !== entityType || item.entityId !== entityId,
    )
  ) {
    throw new Error(
      "Todas las fuentes del lote deben pertenecer a la misma entidad.",
    );
  }

  const resolved = await resolveContextEntity(db, entityType, entityId);
  if (!resolved) {
    await markSourcesFailed(
      db,
      sources.map((item) => item.id),
      new Error("Entidad no encontrada"),
    );
    throw new Error(`Entidad no encontrada: ${entityType}/${entityId}`);
  }

  // --- Extract (por archivo; un fallo no bloquea al resto del lote) ---
  await db.entityContextSource.updateMany({
    where: { id: { in: sources.map((item) => item.id) } },
    data: { status: "extracting", processingError: null },
  });

  const extracted: { source: EntityContextSource; text: string }[] = [];
  for (const source of sources) {
    const text = await extractSourceText(db, source);
    if (text !== null) extracted.push({ source, text });
  }

  if (extracted.length === 0) {
    throw new Error("No se pudo extraer texto de ninguna fuente del lote.");
  }

  const batchIds = extracted.map((item) => item.source.id);

  try {
    // Include sibling ready sources so the profile consolidates across uploads.
    const siblingSources = await db.entityContextSource.findMany({
      where: {
        entityType,
        entityId,
        id: { notIn: batchIds },
        status: "ready",
        extractedText: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, filename: true, extractedText: true },
    });

    const combined = [
      ...siblingSources
        .filter((item) => item.extractedText?.trim())
        .map((item) => `# ${item.filename}\n${item.extractedText}`),
      ...extracted.map((item) => `# ${item.source.filename}\n${item.text}`),
    ].join("\n\n");

    // --- Analyze (una sola pasada para todo el lote) ---
    await db.entityContextSource.updateMany({
      where: { id: { in: batchIds } },
      data: { status: "analyzing" },
    });

    const snapshot = await buildEntityContextSnapshot(db, entityType, entityId);
    const { analysis, model, raw } = await analyzeEntityContext({
      entityType,
      snapshot,
      sourceText: combined,
    });

    const keyFacts: ContextKeyFact[] = analysis.key_facts.map((fact) => ({
      label: fact.label,
      value: fact.value,
      confidence: fact.confidence,
      sourceIds: batchIds,
    }));

    const mapped = mapEnrichmentToItems(analysis, {
      entityType,
      entityId,
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
    const primarySource = extracted[0].source;
    const batchLabel = describeBatch(extracted.map((item) => item.source));

    await withOrgTransaction(organizationId, async (tx) => {
      await tx.entityContextProfile.upsert({
        where: {
          organizationId_entityType_entityId: {
            organizationId,
            entityType,
            entityId,
          },
        },
        create: {
          organizationId,
          entityType,
          entityId,
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
          entityId,
          companyId: resolved.companyId,
          opportunityId: resolved.opportunityId,
          personId: resolved.personId,
          title: notePayload.title,
          body: notePayload.body,
          actorId: primarySource.uploadedBy,
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
            contextSourceId: primarySource.id,
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

      await tx.entityContextSource.updateMany({
        where: { id: { in: batchIds } },
        data: { status: "ready", processingError: null },
      });

      if (resolved.companyId) {
        await appendTimelineEvent(tx, {
          organizationId,
          companyId: resolved.companyId,
          opportunityId: resolved.opportunityId,
          type: "context_enriched",
          title: `Contexto enriquecido: ${batchLabel}`,
          summary: analysis.summary.trim() || null,
          refType: "entity_context_source",
          refId: primarySource.id,
          actorId: primarySource.uploadedBy,
        });
      }
    });
  } catch (error) {
    await markSourcesFailed(db, batchIds, error);
    throw error;
  }
}
