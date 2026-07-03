import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type {
  CustomFieldDefinition,
  CustomFieldType,
  CustomFieldValue,
  EntityType,
} from "@prisma/client";

export async function getFieldDefinitions(entityType: EntityType) {
  return prisma.customFieldDefinition.findMany({
    where: { entityType },
    orderBy: { createdAt: "asc" },
  });
}

// CustomFieldValue.entityId is a polymorphic reference (no DB-level FK to
// the target entity table), so cascading deletes never clean it up on their
// own — callers must delete these rows explicitly when an entity is removed.
export async function deleteCustomFieldValues(
  tx: Prisma.TransactionClient,
  entityType: EntityType,
  entityId: string | string[],
) {
  await tx.customFieldValue.deleteMany({
    where: {
      entityType,
      entityId: Array.isArray(entityId) ? { in: entityId } : entityId,
    },
  });
}

export type MergedCustomField = {
  definition: CustomFieldDefinition;
  value: CustomFieldValue | undefined;
};

export async function mergeCustomFields(
  entityType: EntityType,
  entityId?: string,
): Promise<MergedCustomField[]> {
  const definitions = await getFieldDefinitions(entityType);
  const values = entityId
    ? await prisma.customFieldValue.findMany({
        where: { entityType, entityId },
      })
    : [];
  const valueByDefinitionId = new Map(
    values.map((value) => [value.fieldDefinitionId, value]),
  );

  return definitions.map((definition) => ({
    definition,
    value: valueByDefinitionId.get(definition.id),
  }));
}

export function fieldInputName(definitionId: string) {
  return `customFields.${definitionId}`;
}

function serializeCustomFieldValue(fieldType: CustomFieldType, raw: unknown) {
  switch (fieldType) {
    case "text":
    case "select":
      return {
        valueText: raw ? String(raw) : null,
        valueNumber: null,
        valueBoolean: null,
        valueDate: null,
        valueJson: Prisma.JsonNull,
      };
    case "number":
      return {
        valueNumber: raw !== "" && raw != null ? Number(raw) : null,
        valueText: null,
        valueBoolean: null,
        valueDate: null,
        valueJson: Prisma.JsonNull,
      };
    case "boolean":
      return {
        valueBoolean: Boolean(raw),
        valueText: null,
        valueNumber: null,
        valueDate: null,
        valueJson: Prisma.JsonNull,
      };
    case "date":
      return {
        valueDate: raw ? new Date(String(raw)) : null,
        valueText: null,
        valueNumber: null,
        valueBoolean: null,
        valueJson: Prisma.JsonNull,
      };
    case "multiselect":
      return {
        valueJson: Array.isArray(raw) ? raw : raw ? [raw] : [],
        valueText: null,
        valueNumber: null,
        valueBoolean: null,
        valueDate: null,
      };
  }
}

// Upserts a single custom field value inside an existing transaction. Used by
// the proposal apply engine, which validates the raw value beforehand.
export async function upsertCustomFieldValue(
  tx: Prisma.TransactionClient,
  entityType: EntityType,
  entityId: string,
  definition: CustomFieldDefinition,
  raw: unknown,
) {
  const data = serializeCustomFieldValue(definition.fieldType, raw);
  await tx.customFieldValue.upsert({
    where: {
      entityType_entityId_fieldDefinitionId: {
        entityType,
        entityId,
        fieldDefinitionId: definition.id,
      },
    },
    create: {
      entityType,
      entityId,
      fieldDefinitionId: definition.id,
      ...data,
    },
    update: data,
  });
}

export async function upsertCustomFieldValues(
  entityType: EntityType,
  entityId: string,
  formData: FormData,
) {
  const definitions = await getFieldDefinitions(entityType);

  for (const definition of definitions) {
    const key = fieldInputName(definition.id);
    const raw =
      definition.fieldType === "multiselect"
        ? formData.getAll(key)
        : definition.fieldType === "boolean"
          ? formData.get(key) !== null
          : formData.get(key);

    const data = serializeCustomFieldValue(definition.fieldType, raw);

    await prisma.customFieldValue.upsert({
      where: {
        entityType_entityId_fieldDefinitionId: {
          entityType,
          entityId,
          fieldDefinitionId: definition.id,
        },
      },
      create: {
        entityType,
        entityId,
        fieldDefinitionId: definition.id,
        ...data,
      },
      update: data,
    });
  }
}
