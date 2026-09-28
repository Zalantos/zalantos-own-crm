import { z } from "zod";
import { ACTIVITY_STATUSES } from "@/lib/activity-status";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const activityCreateSchema = z.object({
  companyId: z.preprocess(emptyToUndefined, z.string().optional()),
  personId: z.preprocess(emptyToUndefined, z.string().optional()),
  opportunityId: z.preprocess(emptyToUndefined, z.string().optional()),
  assigneeId: z.preprocess(emptyToUndefined, z.string().optional()),
  completedById: z.preprocess(emptyToUndefined, z.string().optional()),
  type: z.string().min(1, "El tipo es obligatorio"),
  title: z.string().min(1, "El título es obligatorio"),
  description: z.preprocess(emptyToUndefined, z.string().optional()),
  plannedDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dueDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  blockedReason: z.preprocess(emptyToUndefined, z.string().optional()),
  status: z.enum(ACTIVITY_STATUSES).default("todo"),
});

export const activityUpdateSchema = activityCreateSchema.partial().extend({
  id: z.string().min(1),
  // Sin default: a diferencia de la creación, si el form de edición no
  // manda "status" (p. ej. el form de edición inline, o el diálogo del
  // tablero que cambia el estado por una acción aparte) no debe
  // reescribirse el estado actual de la tarea.
  status: z.enum(ACTIVITY_STATUSES).optional(),
});

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
