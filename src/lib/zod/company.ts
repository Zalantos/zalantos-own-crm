import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const companyCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  website: z.preprocess(emptyToUndefined, z.url().optional()),
  industry: z.preprocess(emptyToUndefined, z.string().optional()),
  size: z.preprocess(emptyToUndefined, z.string().optional()),
  country: z.preprocess(emptyToUndefined, z.string().optional()),
  city: z.preprocess(emptyToUndefined, z.string().optional()),
  linkedinUrl: z.preprocess(emptyToUndefined, z.url().optional()),
  description: z.preprocess(emptyToUndefined, z.string().optional()),
  icpScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  fitScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  painScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  status: z.string().default("active"),
});

export const companyUpdateSchema = companyCreateSchema.partial().extend({
  id: z.string().min(1),
});

export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;
