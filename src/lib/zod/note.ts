import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const noteCreateSchema = z
  .object({
    companyId: z.preprocess(emptyToUndefined, z.string().optional()),
    personId: z.preprocess(emptyToUndefined, z.string().optional()),
    opportunityId: z.preprocess(emptyToUndefined, z.string().optional()),
    commercialLeadId: z.preprocess(emptyToUndefined, z.string().optional()),
    commercialPartnerId: z.preprocess(emptyToUndefined, z.string().optional()),
    title: z.preprocess(emptyToUndefined, z.string().optional()),
    body: z.string().min(1, "La nota no puede estar vacía"),
  })
  .refine(
    (data) =>
      data.companyId ??
      data.personId ??
      data.opportunityId ??
      data.commercialLeadId ??
      data.commercialPartnerId,
    "La nota debe estar vinculada a una empresa, persona, oportunidad, prospecto o partner",
  );

export const noteUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.preprocess(emptyToUndefined, z.string().optional()),
  body: z.string().min(1, "La nota no puede estar vacía"),
});

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;
