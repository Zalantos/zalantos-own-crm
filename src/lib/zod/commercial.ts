import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());
const optionalNonnegative = z.preprocess(
  emptyToUndefined,
  z.coerce.number().nonnegative().optional(),
);
const optionalPercentage = z.preprocess(
  emptyToUndefined,
  z.coerce.number().min(0).max(100).optional(),
);

export const commercialPartnerSchema = z
  .object({
    displayName: z.string().trim().min(1, "El nombre es obligatorio"),
    kind: z.enum(["company", "person", "external"]),
    linkedCompanyId: optionalString,
    linkedPersonId: optionalString,
    notes: optionalString,
  })
  .superRefine((value, ctx) => {
    if (value.kind === "company" && !value.linkedCompanyId) {
      ctx.addIssue({
        code: "custom",
        path: ["linkedCompanyId"],
        message: "Selecciona la empresa vinculada.",
      });
    }
    if (value.kind === "person" && !value.linkedPersonId) {
      ctx.addIssue({
        code: "custom",
        path: ["linkedPersonId"],
        message: "Selecciona la persona vinculada.",
      });
    }
    if (value.kind === "company" && value.linkedPersonId) {
      ctx.addIssue({
        code: "custom",
        path: ["linkedPersonId"],
        message: "Un partner empresa no puede vincular además una persona.",
      });
    }
    if (value.kind === "person" && value.linkedCompanyId) {
      ctx.addIssue({
        code: "custom",
        path: ["linkedCompanyId"],
        message: "Un partner persona no puede vincular además una empresa.",
      });
    }
    if (
      value.kind === "external" &&
      (value.linkedCompanyId || value.linkedPersonId)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Un partner externo no lleva un vínculo CRM.",
      });
    }
  });

export const companyCommercialPartnerSchema = z.object({
  companyId: z.string().min(1),
  commercialPartnerId: z.string().min(1),
  role: z.string().trim().min(1, "El rol es obligatorio"),
  defaultProfitSharePercentage: optionalPercentage,
  notes: optionalString,
});

export const opportunityCommercialPartnerSchema = z.object({
  opportunityId: z.string().min(1),
  commercialPartnerId: z.string().min(1),
  companyCommercialPartnerId: optionalString,
  role: z.string().trim().min(1, "El rol es obligatorio"),
  profitSharePercentage: optionalPercentage,
  notes: optionalString,
});

export const offerLineItemSchema = z
  .object({
    type: z.string().trim().min(1),
    description: z.string().trim().min(1),
    quantity: optionalNonnegative,
    amount: z.coerce.number().nonnegative(),
    pricingUnit: z.string().trim().min(1),
    frequency: optionalString,
    startMonth: z.number().int().min(1).optional(),
    endMonth: z.number().int().min(1).optional(),
    billingTrigger: optionalString,
  })
  .refine(
    (item) =>
      item.startMonth === undefined ||
      item.endMonth === undefined ||
      item.endMonth >= item.startMonth,
    { message: "El mes final no puede ser anterior al inicial." },
  );

export const offerDocumentSchema = z.object({
  name: z.string().trim().min(1),
  documentType: optionalString,
  externalUrl: z.preprocess(emptyToUndefined, z.url().optional()),
  entityContextSourceId: optionalString,
  versionLabel: optionalString,
  notes: optionalString,
});

export const offerProfitShareSchema = z.object({
  beneficiaryType: z.enum(["organization", "partner"]),
  commercialPartnerId: optionalString,
  beneficiaryNameSnapshot: z.string().trim().min(1),
  percentage: z.coerce.number().min(0).max(100),
});

export const commercialOfferSchema = z.object({
  opportunityId: z.string().min(1),
  id: optionalString,
  status: z.enum([
    "draft",
    "sent",
    "accepted",
    "rejected",
    "expired",
    "superseded",
  ]),
  offerorName: z.string().trim().min(1),
  presenterTeamMemberId: optionalString,
  presenterNameSnapshot: optionalString,
  productName: optionalString,
  sentAt: optionalDate,
  validBusinessDays: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  validUntil: optionalDate,
  pricingUnit: z.string().trim().min(1),
  plusVat: z.coerce.boolean().default(true),
  exchangeRateToClp: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().optional(),
  ),
  exchangeRateDate: optionalDate,
  exchangeRateSource: optionalString,
  executiveSummary: optionalString,
  painSummary: optionalString,
  solutionSummary: optionalString,
  implementationPlan: optionalString,
  outOfScope: optionalString,
  commercialTerms: optionalString,
  risks: optionalString,
  nextSteps: optionalString,
  economicScope: z.preprocess(
    emptyToUndefined,
    z.enum(["implementation", "first_year", "custom"]).optional(),
  ),
  economicScopeLabel: optionalString,
  economicBaseNetAmount: optionalNonnegative,
  projectCostAmount: optionalNonnegative,
  distributableProfitAmount: optionalNonnegative,
  lineItems: z.array(offerLineItemSchema).default([]),
  documents: z.array(offerDocumentSchema).default([]),
  profitShares: z.array(offerProfitShareSchema).default([]),
});

export const businessHolidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().trim().min(1, "El nombre es obligatorio"),
});
