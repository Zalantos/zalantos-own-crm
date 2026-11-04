"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { forOrg, requireOrgContext } from "@/lib/tenant";
import { runEntityContextPipeline } from "@/lib/entity-context/pipeline";
import { resolveContextEntity } from "@/lib/entity-context/resolve-entity";
import {
  isContextEntityType,
  type ContextEntityType,
} from "@/lib/entity-context/types";
import { appendTimelineEvent } from "@/lib/timeline";

const MAX_MANUAL_CONTEXT_CHARS = 200_000;

function schedulePipeline(organizationId: string, sourceIds: string[]) {
  after(async () => {
    try {
      await runEntityContextPipeline(
        forOrg(organizationId),
        organizationId,
        sourceIds,
      );
    } catch (error) {
      console.error(
        `[entity-context] lote [${sourceIds.join(", ")}] falló`,
        error,
      );
    }
  });
}

export async function registerManualContextSource(input: {
  entityType: string;
  entityId: string;
  title?: string;
  text: string;
}) {
  const { user, org, db } = await requireOrgContext();

  if (!isContextEntityType(input.entityType)) {
    throw new Error("Tipo de entidad inválido");
  }
  const entityType = input.entityType as ContextEntityType;
  const resolved = await resolveContextEntity(db, entityType, input.entityId);
  if (!resolved) throw new Error("Entidad no encontrada");

  const text = input.text.trim();
  if (!text) {
    throw new Error("El texto no puede estar vacío");
  }
  if (text.length > MAX_MANUAL_CONTEXT_CHARS) {
    throw new Error("El texto supera el máximo de 200.000 caracteres");
  }

  const title = input.title?.trim();
  const filename = title
    ? `${title.slice(0, 120)}.txt`
    : `texto-manual-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
  const sizeBytes = Buffer.byteLength(text, "utf8");

  const source = await db.entityContextSource.create({
    data: {
      organizationId: org.id,
      entityType,
      entityId: input.entityId,
      sourceType: "manual",
      filename,
      mimeType: "text/plain",
      storagePath: "",
      sizeBytes,
      extractedText: text,
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
      title: `Texto de contexto: ${filename}`,
      summary: `Fuente manual para ${entityType}`,
      refType: "entity_context_source",
      refId: source.id,
      actorId: user.id,
    });
  }

  schedulePipeline(org.id, [source.id]);
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
  schedulePipeline(org.id, [sourceId]);
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

  // El archivo histórico en el bucket no se borra: su conservación se decide
  // al definir la estrategia documental.
  await db.entityContextSource.delete({ where: { id: sourceId } });

  const resolved = await resolveContextEntity(
    db,
    source.entityType,
    source.entityId,
  );
  if (resolved) revalidatePath(resolved.revalidatePath);
}
