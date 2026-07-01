import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const personCreateSchema = z.object({
  companyId: z.preprocess(emptyToUndefined, z.string().optional()),
  firstName: z.string().min(1, "El nombre es obligatorio"),
  lastName: z.string().min(1, "El apellido es obligatorio"),
  email: z.preprocess(emptyToUndefined, z.email().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
  roleTitle: z.preprocess(emptyToUndefined, z.string().optional()),
  linkedinUrl: z.preprocess(emptyToUndefined, z.url().optional()),
  isDecisionMaker: z.coerce.boolean().default(false),
  isSponsor: z.coerce.boolean().default(false),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
});

export const personUpdateSchema = personCreateSchema.partial().extend({
  id: z.string().min(1),
});

export type PersonCreateInput = z.infer<typeof personCreateSchema>;
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;
