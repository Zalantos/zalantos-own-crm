import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const activityCreateSchema = z.object({
  companyId: z.preprocess(emptyToUndefined, z.string().optional()),
  personId: z.preprocess(emptyToUndefined, z.string().optional()),
  opportunityId: z.preprocess(emptyToUndefined, z.string().optional()),
  type: z.string().min(1, "El tipo es obligatorio"),
  title: z.string().min(1, "El título es obligatorio"),
  description: z.preprocess(emptyToUndefined, z.string().optional()),
  dueDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  status: z.string().default("pending"),
});

export const activityUpdateSchema = activityCreateSchema.partial().extend({
  id: z.string().min(1),
});

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
