import { z } from "zod";
import { OpportunityStage } from "@prisma/client";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const OPPORTUNITY_STAGES = Object.values(OpportunityStage);

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  lead_identificado: "Lead identificado",
  investigacion_realizada: "Investigación realizada",
  primer_contacto: "Primer contacto",
  reunion_discovery: "Reunión discovery",
  dolor_validado: "Dolor validado",
  sprint_0_ofrecido: "Sprint 0 ofrecido",
  sprint_0_aceptado: "Sprint 0 aceptado",
  diagnostico_realizado: "Diagnóstico realizado",
  propuesta_principal: "Propuesta principal",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

export const opportunityCreateSchema = z.object({
  companyId: z.string().min(1, "La empresa es obligatoria"),
  name: z.string().min(1, "El nombre es obligatorio"),
  stage: z.enum(OpportunityStage).default("lead_identificado"),
  estimatedValue: z.coerce.number().nonnegative().optional().nullable(),
  probability: z.coerce.number().int().min(0).max(100).optional().nullable(),
  source: z.preprocess(emptyToUndefined, z.string().optional()),
  mainPain: z.preprocess(emptyToUndefined, z.string().optional()),
  urgency: z.preprocess(emptyToUndefined, z.string().optional()),
  decisionMakerId: z.preprocess(emptyToUndefined, z.string().optional()),
  sponsorId: z.preprocess(emptyToUndefined, z.string().optional()),
  nextStep: z.preprocess(emptyToUndefined, z.string().optional()),
  nextStepDueDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  expectedCloseDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  status: z.string().default("open"),
  lossReason: z.preprocess(emptyToUndefined, z.string().optional()),
});

export const opportunityUpdateSchema = opportunityCreateSchema
  .partial()
  .extend({
    id: z.string().min(1),
  });

export const opportunityStageChangeSchema = z.object({
  id: z.string().min(1),
  stage: z.enum(OpportunityStage),
});

export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;
export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;
