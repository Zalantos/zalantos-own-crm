"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { forOrg, requireOrgContext } from "@/lib/tenant";
import { classifyEvidence } from "@/lib/meeting-intelligence/extraction";
import { deleteObject } from "@/lib/meeting-intelligence/storage/r2";
import { runEntityContextPipeline } from "@/lib/entity-context/pipeline";
import { resolveContextEntity } from "@/lib/entity-context/resolve-entity";
import {
  isContextEntityType,
  type ContextEntityType,
} from "@/lib/entity-context/types";
import { appendTimelineEvent } from "@/lib/timeline";

function schedulePipeline(organizationId: string, sourceId: string) {
  after(async () => {
    try {
      await runEntityContextPipeline(
        forOrg(organizationId),
        organizationId,
        sourceId,
      );
    } catch (error) {
      console.error(`[entity-context] source ${sourceId} falló`, error);
    }
  });
}

export async function registerContextSource(input: {
  entityType: string;
  entityId: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  sizeBytes?: number;
  sourceType?: string;
  externalRef?: string | null;
}) {
  const { user, org, db } = await requireOrgContext();

  if (!isContextEntityType(input.entityType)) {
    throw new Error("Tipo de entidad inválido");
  }
  const entityType = input.entityType as ContextEntityType;
  const resolved = await resolveContextEntity(db, entityType, input.entityId);
  if (!resolved) throw new Error("Entidad no encontrada");

  const { kind } = classifyEvidence(input.filename, input.mimeType);
  if (kind !== "text") {
    throw new Error(
      "Solo se admiten PDF, DOCX, TXT o Markdown en contexto de entidad.",
    );
  }

  const source = await db.entityContextSource.create({
    data: {
      organizationId: org.id,
      entityType,
      entityId: input.entityId,
      sourceType: input.sourceType ?? "upload",
      filename: input.filename,
      mimeType: input.mimeType,
      storagePath: input.storagePath,
      sizeBytes: input.sizeBytes ?? null,
      externalRef: input.externalRef ?? null,
      uploadedBy: user.id,
      status: "uploaded",
    },
  });

  if (resolved.companyId) {
    await appendTimelineEvent(db, {
      organizationId: org.id,
      companyId: resolved.companyId,
      opportunityId: resolved.opportunityId,
      type: "evidence_uploaded",
      title: `Documento de contexto: ${input.filename}`,
      summary: `Fuente para ${entityType}`,
      refType: "entity_context_source",
      refId: source.id,
      actorId: user.id,
    });
  }

  schedulePipeline(org.id, source.id);
  revalidatePath(resolved.revalidatePath);
  return { sourceId: source.id };
}

export async function reprocessContextSource(sourceId: string) {
  const { org, db } = await requireOrgContext();
  const source = await db.entityContextSource.findUnique({
    where: { id: sourceId },
  });
  if (!source) throw new Error("Fuente no encontrada");
  if (!isContextEntityType(source.entityType)) {
    throw new Error("Tipo de entidad inválido");
  }

  await db.entityContextSource.update({
    where: { id: sourceId },
    data: { status: "uploaded", processingError: null },
  });

  const resolved = await resolveContextEntity(
    db,
    source.entityType,
    source.entityId,
  );
  schedulePipeline(org.id, sourceId);
  if (resolved) revalidatePath(resolved.revalidatePath);
}

export async function deleteContextSource(sourceId: string) {
  const { db } = await requireOrgContext();
  const source = await db.entityContextSource.findUnique({
    where: { id: sourceId },
  });
  if (!source) throw new Error("Fuente no encontrada");
  if (!isContextEntityType(source.entityType)) {
    throw new Error("Tipo de entidad inválido");
  }

  if (source.storagePath) {
    try {
      await deleteObject(source.storagePath);
    } catch (error) {
      console.error(`[entity-context] delete R2 ${source.storagePath}`, error);
    }
  }

  await db.entityContextSource.delete({ where: { id: sourceId } });

  const resolved = await resolveContextEntity(
    db,
    source.entityType,
    source.entityId,
  );
  if (resolved) revalidatePath(resolved.revalidatePath);
}
