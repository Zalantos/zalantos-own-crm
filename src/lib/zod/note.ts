import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const noteCreateSchema = z
  .object({
    companyId: z.preprocess(emptyToUndefined, z.string().optional()),
    personId: z.preprocess(emptyToUndefined, z.string().optional()),
    opportunityId: z.preprocess(emptyToUndefined, z.string().optional()),
    title: z.preprocess(emptyToUndefined, z.string().optional()),
    body: z.string().min(1, "La nota no puede estar vacía"),
  })
  .refine(
    (data) => data.companyId ?? data.personId ?? data.opportunityId,
    "La nota debe estar vinculada a una empresa, persona u oportunidad",
  );

export const noteUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.preprocess(emptyToUndefined, z.string().optional()),
  body: z.string().min(1, "La nota no puede estar vacía"),
});

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;
