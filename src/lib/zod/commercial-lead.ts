import { z } from "zod";
import { SOURCE_CHANNELS } from "@/lib/commercial/attribution";
import { INTERACTION_TYPES } from "@/lib/activity-types";
import { NEXT_STEP_CHANNELS } from "@/lib/commercial/next-action";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

const optionalText = z.preprocess(emptyToUndefined, z.string().trim().optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());

export const commercialLeadCreateSchema = z
  .object({
    title: optionalText,
    companyId: optionalText,
    companyName: optionalText,
    personId: optionalText,
    firstName: optionalText,
    lastName: optionalText,
    email: z.preprocess(emptyToUndefined, z.email("Email inválido").optional()),
    phone: optionalText,
    roleTitle: optionalText,
    linkedinUrl: optionalText,
    status: z.enum(["prospect", "contacted", "lead"]).default("prospect"),
    ownerId: optionalText,
    priority: z.preprocess(emptyToUndefined, z.enum(["low", "medium", "high"]).optional()),
    description: optionalText,
    interestSignal: optionalText,
    // Atribución (primer toque)
    sourceChannel: z.preprocess(emptyToUndefined, z.enum(SOURCE_CHANNELS).optional()),
    campaignId: optionalText,
    referrerPersonId: optionalText,
    referrerPartnerId: optionalText,
    sourceDetail: optionalText,
    utmSource: optionalText,
    utmMedium: optionalText,
    utmCampaign: optionalText,
    // Intento de contacto (si se crea como contactado)
    contactType: z.preprocess(emptyToUndefined, z.enum(INTERACTION_TYPES).optional()),
    contactAt: optionalDate,
    contactSummary: optionalText,
    nextStep: optionalText,
    nextStepDueDate: optionalDate,
    nextStepChannel: z.preprocess(emptyToUndefined, z.enum(NEXT_STEP_CHANNELS).optional()),
  })
  .refine((data) => data.companyId || data.companyName || data.personId || data.firstName, {
    message: "Indica al menos una empresa o una persona.",
    path: ["companyName"],
  });

export const commercialLeadStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["prospect", "contacted", "lead", "disqualified"]),
  reason: optionalText,
  interestSignal: optionalText,
  contactType: z.preprocess(emptyToUndefined, z.enum(INTERACTION_TYPES).optional()),
  contactAt: optionalDate,
  contactSummary: optionalText,
});

export const commercialLeadUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "El nombre es obligatorio"),
  ownerId: optionalText,
  priority: z.preprocess(emptyToUndefined, z.enum(["low", "medium", "high"]).optional()),
  description: optionalText,
  interestSignal: optionalText,
  companyId: optionalText,
  personId: optionalText,
});

export const commercialLeadConvertSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "El nombre de la oportunidad es obligatorio"),
  companyId: optionalText,
  mainPain: optionalText,
  situation: optionalText,
  estimatedValue: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  ownerId: optionalText,
  nextStep: optionalText,
  nextStepDueDate: optionalDate,
});
