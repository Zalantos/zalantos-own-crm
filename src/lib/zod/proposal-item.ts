import { z } from "zod";

// Validation for a human-edited CRMChangeItem.afterValue, keyed by item type.
// Mirrors the payload shapes that apply.ts expects for each type.

const emptyToNull = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? null : val;

const optionalString = z.preprocess(emptyToNull, z.string().nullable());

const isoDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha inválida")
    .nullable(),
);

export const ITEM_AFTER_VALUE_SCHEMAS: Record<string, z.ZodType> = {
  update_field: z.object({
    field: z.string().min(1),
    value: z.preprocess(emptyToNull, z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }),
  update_pain: z.object({
    value: z.string().min(1, "El dolor no puede estar vacío"),
  }),
  // El valor es el `key` de una PipelineStage de la org; se valida contra las
  // etapas reales al aplicar (apply.ts) y al editar (proposal-item-editor).
  stage_change: z.object({
    value: z.string().min(1),
  }),
  update_next_step: z.object({
    nextStep: z.string().min(1, "El próximo paso no puede estar vacío"),
    nextStepDueDate: isoDate,
  }),
  create_task: z.object({
    title: z.string().min(1, "El título es obligatorio"),
    description: optionalString,
    dueInDays: z.preprocess(
      emptyToNull,
      z.coerce.number().int().min(0).nullable(),
    ),
  }),
  add_note: z.object({
    title: optionalString,
    body: z.string().min(1, "La nota no puede estar vacía"),
  }),
  add_contact: z.object({
    firstName: z.string().min(1, "El nombre es obligatorio"),
    lastName: z.string().optional().default(""),
    email: optionalString,
    phone: optionalString,
    roleTitle: optionalString,
    linkedinUrl: optionalString,
    notes: optionalString,
    isDecisionMaker: z.boolean().optional().default(false),
    isSponsor: z.boolean().optional().default(false),
  }),
  // Same payload as add_contact; apply.ts fills only the empty fields on the
  // matched existing person instead of creating a new one.
  link_contact: z.object({
    firstName: z.string().min(1, "El nombre es obligatorio"),
    lastName: z.string().optional().default(""),
    email: optionalString,
    phone: optionalString,
    roleTitle: optionalString,
    linkedinUrl: optionalString,
    notes: optionalString,
    isDecisionMaker: z.boolean().optional().default(false),
    isSponsor: z.boolean().optional().default(false),
  }),
};
