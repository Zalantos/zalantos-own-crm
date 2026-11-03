import { z } from "zod";
import { ACTIVITY_STATUSES } from "@/lib/activity-status";
import { ACTIVITY_PRIORITIES } from "@/lib/activity-priority";
import { INTERACTION_TYPES } from "@/lib/activity-types";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const activityCreateSchema = z.object({
  companyId: z.preprocess(emptyToUndefined, z.string().optional()),
  personId: z.preprocess(emptyToUndefined, z.string().optional()),
  opportunityId: z.preprocess(emptyToUndefined, z.string().optional()),
  commercialLeadId: z.preprocess(emptyToUndefined, z.string().optional()),
  commercialPartnerId: z.preprocess(emptyToUndefined, z.string().optional()),
  assigneeId: z.preprocess(emptyToUndefined, z.string().optional()),
  completedById: z.preprocess(emptyToUndefined, z.string().optional()),
  type: z.string().min(1, "El tipo es obligatorio"),
  title: z.string().min(1, "El título es obligatorio"),
  description: z.preprocess(emptyToUndefined, z.string().optional()),
  plannedDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dueDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  blockedReason: z.preprocess(emptyToUndefined, z.string().optional()),
  status: z.enum(ACTIVITY_STATUSES).default("todo"),
  priority: z.preprocess(emptyToUndefined, z.enum(ACTIVITY_PRIORITIES).optional()),
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

// Interacción ya ocurrida (email, WhatsApp, llamada, LinkedIn, reunión...).
// Es una actividad registrada, no una tarea pendiente.
export const interactionLogSchema = z
  .object({
    companyId: z.preprocess(emptyToUndefined, z.string().optional()),
    personId: z.preprocess(emptyToUndefined, z.string().optional()),
    opportunityId: z.preprocess(emptyToUndefined, z.string().optional()),
    commercialLeadId: z.preprocess(emptyToUndefined, z.string().optional()),
    commercialPartnerId: z.preprocess(emptyToUndefined, z.string().optional()),
    type: z.enum(INTERACTION_TYPES),
    title: z.string().trim().min(1, "El título es obligatorio"),
    occurredAt: z.coerce.date(),
    durationMinutes: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(0).max(1440).optional(),
    ),
    description: z.preprocess(emptyToUndefined, z.string().optional()),
    outcomes: z.preprocess(emptyToUndefined, z.string().optional()),
    // Para prospectos: marcar como contactado si era un primer contacto.
    markContacted: z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean()).default(false),
  })
  .refine((data) => data.occurredAt.getTime() <= Date.now() + 60_000, {
    message: "Una interacción registrada no puede tener fecha futura (para eso crea una tarea).",
    path: ["occurredAt"],
  });
