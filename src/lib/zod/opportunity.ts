import { z } from "zod";
import { LossReason } from "@prisma/client";
import { SOURCE_CHANNELS } from "@/lib/commercial/attribution";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

const optionalText = z.preprocess(emptyToUndefined, z.string().optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());

export const SPRINT0_STATUSES = [
  "offered",
  "accepted",
  "scheduled",
  "done",
  "diagnosis_delivered",
  "declined",
] as const;

export const SPRINT0_STATUS_LABELS: Record<(typeof SPRINT0_STATUSES)[number], string> = {
  offered: "Ofrecido",
  accepted: "Aceptado",
  scheduled: "Agendado",
  done: "Realizado",
  diagnosis_delivered: "Diagnóstico entregado",
  declined: "Rechazado",
};

// El estado (pausada/ganada/perdida) NO se edita desde este formulario: se
// cambia con changeOpportunityStatus, que exige motivo/evidencia.
export const opportunityCreateSchema = z.object({
  companyId: z.string().min(1, "La empresa es obligatoria"),
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  // Si viene vacío, la action usa la primera etapa operativa de la org.
  stageId: optionalText,
  estimatedValue: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  recurringValue: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  probability: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(100).optional()),
  source: optionalText,
  mainPain: optionalText,
  urgency: optionalText,
  decisionMakerId: optionalText,
  sponsorId: optionalText,
  nextStep: optionalText,
  nextStepDueDate: optionalDate,
  expectedCloseDate: optionalDate,
  ownerId: optionalText,
  // SPICED + Sprint 0 + propuesta (información deseable, no bloqueante).
  situation: optionalText,
  impact: optionalText,
  criticalEvent: optionalText,
  criticalEventDate: optionalDate,
  decisionProcess: optionalText,
  sprint0Status: z.preprocess(emptyToUndefined, z.enum(SPRINT0_STATUSES).optional()),
  sprint0ScheduledAt: optionalDate,
  sprint0CompletedAt: optionalDate,
  diagnosisDeliveredAt: optionalDate,
  expectedResponseAt: optionalDate,
  // Atribución (primer toque) — solo al crear.
  sourceChannel: z.preprocess(emptyToUndefined, z.enum(SOURCE_CHANNELS).optional()),
  campaignId: optionalText,
  referrerPersonId: optionalText,
  referrerPartnerId: optionalText,
  sourceDetail: optionalText,
});

export const opportunityUpdateSchema = opportunityCreateSchema
  .omit({
    sourceChannel: true,
    campaignId: true,
    referrerPersonId: true,
    referrerPartnerId: true,
    sourceDetail: true,
  })
  .partial()
  .extend({
    id: z.string().min(1),
  });

export const opportunityStageChangeSchema = z.object({
  id: z.string().min(1),
  stageId: z.string().min(1),
});

export const opportunityStatusChangeSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["open", "paused", "won", "lost"]),
  reason: optionalText,
  reactivateAt: optionalDate,
  reactivationCriteria: optionalText,
  reactivateStageId: optionalText,
  wonEvidence: optionalText,
  closedAt: optionalDate,
  lossReason: z.preprocess(emptyToUndefined, z.nativeEnum(LossReason).optional()),
  lossDetail: optionalText,
});

export const proposalSentSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(["decision", "sent"]),
  sentAt: z.coerce.date(),
  expectedResponseAt: optionalDate,
});

export const rumboHandoffSchema = z.object({
  id: z.string().min(1),
  projectName: z.string().trim().min(1, "El nombre del proyecto es obligatorio"),
  startDate: optionalDate,
  scopeSummary: optionalText,
  responsibleUserId: optionalText,
});

export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;
export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;
