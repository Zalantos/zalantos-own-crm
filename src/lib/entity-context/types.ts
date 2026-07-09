import type { EntityType } from "@prisma/client";

export const CONTEXT_ENTITY_TYPES = [
  "company",
  "person",
  "opportunity",
] as const;

export type ContextEntityType = (typeof CONTEXT_ENTITY_TYPES)[number];

export function isContextEntityType(
  value: string,
): value is ContextEntityType {
  return (CONTEXT_ENTITY_TYPES as readonly string[]).includes(value);
}

export function toEntityType(value: ContextEntityType): EntityType {
  return value as EntityType;
}

export type ContextKeyFact = {
  label: string;
  value: string;
  confidence?: number;
  sourceIds?: string[];
};

export const CONTEXT_SOURCE_STATUSES = [
  "uploaded",
  "extracting",
  "extracted",
  "analyzing",
  "ready",
  "failed",
] as const;

export type ContextSourceStatus = (typeof CONTEXT_SOURCE_STATUSES)[number];
