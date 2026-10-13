import { z } from "zod";

export const personCompanyRelationshipInputSchema = z.object({
  companyId: z.string().min(1),
  roles: z.array(z.string().trim().min(1)).min(1),
  roleTitle: z.string().trim().optional().nullable(),
  isPrimary: z.boolean(),
  startedAt: z.coerce.date().optional().nullable(),
  endedAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const personCompanyRelationshipsSchema = z
  .array(personCompanyRelationshipInputSchema)
  .superRefine((relationships, ctx) => {
    const companyIds = new Set<string>();
    let primaryCount = 0;
    relationships.forEach((relationship, index) => {
      if (companyIds.has(relationship.companyId)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "companyId"],
          message: "La empresa está repetida.",
        });
      }
      companyIds.add(relationship.companyId);
      if (relationship.isPrimary && !relationship.endedAt) primaryCount += 1;
    });
    if (relationships.length > 0 && primaryCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Debe existir exactamente una empresa principal activa.",
      });
    }
  });
