import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

// El nombre es opcional a nivel de schema porque al crear desde un usuario
// vinculado se hereda su nombre; la action valida que al final haya uno.
export const teamMemberCreateSchema = z.object({
  name: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  email: z.preprocess(emptyToUndefined, z.email().optional()),
  userId: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type TeamMemberCreateInput = z.infer<typeof teamMemberCreateSchema>;
