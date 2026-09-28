import { z } from "zod";
import { normalizeEmail, normalizePersonName } from "@/lib/crm/person-dedup";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

const normalizedName = z.string().transform(normalizePersonName);
const normalizedOptionalEmail = z.preprocess(
  (value) => (typeof value === "string" ? normalizeEmail(value) : value),
  z.email().nullable().optional(),
);

export const personCreateSchema = z.object({
  companyId: z.preprocess(emptyToUndefined, z.string().optional()),
  firstName: normalizedName.pipe(z.string().min(1, "El nombre es obligatorio")),
  lastName: normalizedName.pipe(
    z.string().min(1, "El apellido es obligatorio"),
  ),
  email: normalizedOptionalEmail,
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
