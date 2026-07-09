import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());
const optionalMoney = z.preprocess(
  emptyToUndefined,
  z.coerce.number().nonnegative().optional(),
);

export const companyCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  website: z.preprocess(emptyToUndefined, z.url().optional()),
  industry: optionalString,
  size: optionalString,
  country: optionalString,
  city: optionalString,
  linkedinUrl: z.preprocess(emptyToUndefined, z.url().optional()),
  description: optionalString,
  icpScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  fitScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  painScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  status: z.string().default("active"),
  source: optionalString,
  priority: optionalString,
  mainPain: optionalString,
  productInterest: optionalString,
  potentialValue: optionalMoney,
  buyingTiming: optionalString,
  urgency: optionalString,
  competitor: optionalString,
  currentProvider: optionalString,
  nextStep: optionalString,
  nextStepDueDate: optionalDate,
  lastContactAt: optionalDate,
});

export const companyUpdateSchema = companyCreateSchema.partial().extend({
  id: z.string().min(1),
});

export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;
