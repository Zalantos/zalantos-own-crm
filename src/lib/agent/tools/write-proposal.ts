import { defineAgentTool } from "@/lib/agent/tool-definition";
import { z } from "zod";
import type { TenantClient } from "@/lib/tenant";
import { getOrgStages, stagesByKey } from "@/lib/pipeline/stages";
import {
  coerceFieldValue,
  getWritableFields,
  type AgentEntity,
} from "@/lib/agent/field-registry";
import { snapshotCustomFields } from "@/lib/agent/snapshot";
import { registerProposalChange } from "@/lib/agent/proposals";
import {
  findExistingPerson,
  normalizeEmail,
  normalizePersonName,
} from "@/lib/crm/person-dedup";
import type { AgentToolContext } from "@/lib/agent/executor";

const entitySchema = z.enum(["company", "opportunity", "person"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function findContactItemInTurnProposal(
  ctx: AgentToolContext,
  companyId: string,
  contact: { firstName: string; lastName: string; email: string | null },
) {
  if (!ctx.turnState.proposalId) return null;

  const proposal = await ctx.db.cRMChangeProposal.findUnique({
    where: { id: ctx.turnState.proposalId },
    select: {
      companyId: true,
      items: {
        where: {
          type: { in: ["add_contact", "link_contact"] },
          status: { notIn: ["applied", "reverted"] },
        },
        select: { id: true, afterValue: true },
      },
    },
  });
  if (!proposal) return null;

  const targetEmail = normalizeEmail(contact.email);
  const targetFirstName = normalizePersonName(contact.firstName).toLowerCase();
  const targetLastName = normalizePersonName(contact.lastName).toLowerCase();

  return (
    proposal.items.find((item) => {
      const after = asRecord(item.afterValue);
      const itemEmail = normalizeEmail(
        after.email == null ? null : String(after.email),
      );
      if (targetEmail && itemEmail === targetEmail) return true;
      if (proposal.companyId !== companyId) return false;
      return (
        normalizePersonName(
          after.firstName == null ? null : String(after.firstName),
        ).toLowerCase() === targetFirstName &&
        normalizePersonName(
          after.lastName == null ? null : String(after.lastName),
        ).toLowerCase() === targetLastName
      );
    }) ?? null
  );
}

// Shared input fields the model must supply on every mutation proposal so the
// reviewer sees a real confidence and a citation, not a blind pre-approval.
const confidenceSchema = z
  .number()
  .min(0)
  .max(1)
  .describe(
    "Tu confianza (0-1) en este cambio. Bajala si inferís o dudás; solo ≥ 0.8 se pre-aprueba.",
  );
const evidenceSchema = z
  .string()
  .optional()
  .describe(
    "Cita textual del mensaje del usuario o documento que justifica el cambio (vacío si no hay una frase concreta).",
  );

const optionalIsoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Fecha inválida: usar formato ISO 8601",
  })
  .optional();

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// Looks up the target record and the companyId a proposal must hang from.
async function loadTarget(
  db: TenantClient,
  entity: AgentEntity,
  entityId: string,
) {
  switch (entity) {
    case "company": {
      const record = await db.company.findUnique({
        where: { id: entityId },
      });
      if (!record) throw new Error(`Empresa no encontrada: ${entityId}`);
      return {
        record: record as Record<string, unknown>,
        companyId: record.id,
      };
    }
    case "opportunity": {
      const record = await db.opportunity.findUnique({
        where: { id: entityId },
        include: { stage: { select: { key: true, label: true } } },
      });
      if (!record) throw new Error(`Oportunidad no encontrada: ${entityId}`);
      // El registry expone "stage" como key string; aplanamos la relación.
      const { stage, ...rest } = record;
      return {
        record: { ...rest, stage: stage.key } as Record<string, unknown>,
        companyId: record.companyId,
      };
    }
    case "person": {
      const record = await db.person.findUnique({
        where: { id: entityId },
      });
      if (!record) throw new Error(`Persona no encontrada: ${entityId}`);
      if (!record.companyId) {
        throw new Error(
          "El contacto no tiene empresa asociada; no se pueden proponer cambios sobre él.",
        );
      }
      return {
        record: record as unknown as Record<string, unknown>,
        companyId: record.companyId,
      };
    }
  }
}

// Risky mutations: these tools never write CRM data directly — their only
// side effect is creating a CRMChangeProposal that the user reviews in chat.
export function buildProposalTools(ctx: AgentToolContext) {
  return {
    update_record_fields: defineAgentTool({
      description:
        "Propone cambios de campos sobre una empresa, oportunidad o persona (incluye campos custom con prefijo 'custom.'). NO aplica los cambios: crea una propuesta que el usuario revisa y aprueba en el chat.",
      inputSchema: z.object({
        entity: entitySchema,
        entityId: z.string().min(1),
        updates: z
          .array(
            z.object({
              field: z
                .string()
                .min(1)
                .describe("Nombre del campo según list_writable_fields"),
              value: z
                .union([z.string(), z.number(), z.boolean(), z.null()])
                .describe("Nuevo valor (null para vaciar)"),
            }),
          )
          .min(1)
          .max(20),
        reason: z
          .string()
          .min(1)
          .describe(
            "Justificación del cambio, citando la fuente si viene de un documento",
          ),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({
        entity,
        entityId,
        updates,
        reason,
        confidence,
        evidence,
      }) => {
        const fields = await getWritableFields(ctx.db, entity);
        const { record, companyId } = await loadTarget(
          ctx.db,
          entity,
          entityId,
        );
        const customValues = await snapshotCustomFields(
          ctx.db,
          entity,
          entityId,
        );

        const items = [];
        for (const update of updates) {
          const spec = fields[update.field];
          if (!spec) {
            return {
              error: `Campo no permitido en ${entity}: ${update.field}. Usá list_writable_fields para ver los campos válidos.`,
            };
          }
          // Validate/coerce now so a bad value fails before the proposal exists.
          const coerced = coerceFieldValue(spec, update.field, update.value);
          const before = spec.customDefinition
            ? (customValues[update.field] ?? null)
            : ((record[update.field] as unknown) ?? null);

          const enumLabel = (value: unknown) =>
            spec.enumLabels?.[String(value)] ?? formatValue(value);

          items.push({
            type: "update_field" as const,
            entity,
            entityId,
            beforeValue: {
              field: update.field,
              value: formatBeforeJson(before),
            },
            afterValue: { field: update.field, value: update.value },
            explanation: reason,
            confidence,
            evidence: evidence ?? null,
            label: spec.label,
            before:
              spec.type === "enum" ? enumLabel(before) : formatValue(before),
            after:
              spec.type === "enum" ? enumLabel(coerced) : formatValue(coerced),
          });
        }

        return registerProposalChange(
          ctx,
          {
            companyId,
            opportunityId:
              entity === "opportunity"
                ? entityId
                : ctx.pageContext?.opportunityId,
          },
          items,
        );
      },
    }),

    change_stage: defineAgentTool({
      description:
        "Propone un cambio de etapa de una oportunidad. NO lo aplica: crea una propuesta que el usuario aprueba en el chat. El valor de `stage` es el key de una etapa según list_writable_fields.",
      inputSchema: z.object({
        opportunityId: z.string().min(1),
        stage: z.string().min(1),
        reason: z.string().min(1),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({
        opportunityId,
        stage,
        reason,
        confidence,
        evidence,
      }) => {
        const opportunity = await ctx.db.opportunity.findUnique({
          where: { id: opportunityId },
          select: {
            id: true,
            name: true,
            stage: { select: { key: true, label: true } },
            companyId: true,
          },
        });
        if (!opportunity) {
          return { error: `Oportunidad no encontrada: ${opportunityId}` };
        }

        const stages = stagesByKey(await getOrgStages(ctx.db));
        const target = stages.get(stage);
        if (!target) {
          return {
            error: `Etapa inválida "${stage}". Etapas válidas: ${[...stages.keys()].join(", ")}`,
          };
        }

        return registerProposalChange(
          ctx,
          { companyId: opportunity.companyId, opportunityId },
          [
            {
              type: "stage_change",
              entity: "opportunity",
              entityId: opportunityId,
              beforeValue: { value: opportunity.stage.key },
              afterValue: { value: target.key },
              explanation: reason,
              confidence,
              evidence: evidence ?? null,
              label: `Etapa de "${opportunity.name}"`,
              before: opportunity.stage.label,
              after: target.label,
            },
          ],
        );
      },
    }),

    create_contact: defineAgentTool({
      description:
        "Propone dar de alta un contacto nuevo en una empresa. NO lo crea: genera una propuesta que el usuario aprueba en el chat.",
      inputSchema: z.object({
        companyId: z.string().min(1),
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        roleTitle: z.string().optional(),
        linkedinUrl: z.url().optional(),
        notes: z.string().optional(),
        isDecisionMaker: z.boolean().optional(),
        isSponsor: z.boolean().optional(),
        reason: z.string().min(1),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({
        companyId,
        reason,
        confidence,
        evidence,
        ...contact
      }) => {
        const company = await ctx.db.company.findUnique({
          where: { id: companyId },
          select: { id: true, name: true },
        });
        if (!company) {
          return { error: `Empresa no encontrada: ${companyId}` };
        }

        const firstName = normalizePersonName(contact.firstName);
        const lastName = normalizePersonName(contact.lastName);
        const email = normalizeEmail(contact.email);
        const fullName = `${firstName} ${lastName}`.trim();
        const afterValue = {
          firstName,
          lastName,
          email,
          phone: contact.phone ?? null,
          roleTitle: contact.roleTitle ?? null,
          linkedinUrl: contact.linkedinUrl ?? null,
          notes: contact.notes ?? null,
          isDecisionMaker: contact.isDecisionMaker ?? false,
          isSponsor: contact.isSponsor ?? false,
        };

        // Dedup: if the person already exists, propose linking/completing it
        // instead of creating a duplicate.
        const existing = await findExistingPerson(ctx.db, ctx.organizationId, {
          companyId,
          email,
          firstName,
          lastName,
        });

        if (existing) {
          if (
            existing.matchedBy === "email" &&
            existing.companyId !== companyId
          ) {
            const location = existing.companyName
              ? `en ${existing.companyName}`
              : "sin empresa";
            return {
              status: "contact_conflict" as const,
              personId: existing.id,
              name: `${existing.firstName} ${existing.lastName}`.trim(),
              email: existing.email,
              companyName: existing.companyName,
              message:
                `Ese email ya pertenece a ${existing.firstName} ${existing.lastName} ${location}. No se creó ni vinculó otro contacto.`.trim(),
            };
          }

          const repeatedItem = await findContactItemInTurnProposal(
            ctx,
            companyId,
            afterValue,
          );
          if (repeatedItem) {
            return {
              status: "contact_already_in_proposal" as const,
              proposalId: ctx.turnState.proposalId,
              itemId: repeatedItem.id,
              message:
                "Ese contacto ya está incluido en la propuesta de este turno.",
            };
          }

          return registerProposalChange(
            ctx,
            { companyId, opportunityId: ctx.pageContext?.opportunityId },
            [
              {
                type: "link_contact",
                entity: "person",
                entityId: existing.id,
                duplicateOfId: existing.id,
                beforeValue: null,
                afterValue,
                explanation:
                  `Ya existe ${existing.firstName} ${existing.lastName}`.trim() +
                  ` en la empresa; se propone vincularlo/completarlo. ${reason}`.trim(),
                confidence,
                evidence: evidence ?? null,
                label: `Vincular contacto existente en ${company.name}`,
                before: `${existing.firstName} ${existing.lastName}`.trim(),
                after: `${fullName}${contact.roleTitle ? ` (${contact.roleTitle})` : ""}`,
              },
            ],
          );
        }

        const repeatedItem = await findContactItemInTurnProposal(
          ctx,
          companyId,
          afterValue,
        );
        if (repeatedItem) {
          return {
            status: "contact_already_in_proposal" as const,
            proposalId: ctx.turnState.proposalId,
            itemId: repeatedItem.id,
            message:
              "Ese contacto ya está incluido en la propuesta de este turno.",
          };
        }

        return registerProposalChange(
          ctx,
          { companyId, opportunityId: ctx.pageContext?.opportunityId },
          [
            {
              type: "add_contact",
              entity: "person",
              entityId: null,
              beforeValue: null,
              afterValue,
              explanation: reason,
              confidence,
              evidence: evidence ?? null,
              label: `Nuevo contacto en ${company.name}`,
              before: "—",
              after: `${fullName}${contact.roleTitle ? ` (${contact.roleTitle})` : ""}`,
            },
          ],
        );
      },
    }),

    create_opportunity: defineAgentTool({
      description:
        "Propone dar de alta una oportunidad nueva en una empresa. NO la crea: genera una propuesta que el usuario aprueba en el chat.",
      inputSchema: z.object({
        companyId: z.string().min(1),
        name: z.string().min(1),
        stage: z
          .string()
          .optional()
          .describe(
            "Key de la etapa inicial según list_writable_fields (opportunity). Si no se especifica, se usa la primera etapa del pipeline.",
          ),
        estimatedValue: z.number().optional(),
        probability: z.number().int().min(0).max(100).optional(),
        source: z.string().optional(),
        mainPain: z.string().optional(),
        urgency: z.string().optional(),
        decisionMakerId: z.string().optional(),
        sponsorId: z.string().optional(),
        nextStep: z.string().optional(),
        nextStepDueDate: optionalIsoDateSchema,
        expectedCloseDate: optionalIsoDateSchema,
        status: z.string().optional(),
        lossReason: z.string().optional(),
        reason: z.string().min(1),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({
        companyId,
        name,
        stage,
        estimatedValue,
        probability,
        source,
        mainPain,
        urgency,
        decisionMakerId,
        sponsorId,
        nextStep,
        nextStepDueDate,
        expectedCloseDate,
        status,
        lossReason,
        reason,
        confidence,
        evidence,
      }) => {
        const company = await ctx.db.company.findUnique({
          where: { id: companyId },
          select: { id: true, name: true },
        });
        if (!company) {
          return { error: `Empresa no encontrada: ${companyId}` };
        }

        const stages = await getOrgStages(ctx.db);
        const target = stage ? stagesByKey(stages).get(stage) : stages[0];
        if (!target) {
          return {
            error: stage
              ? `Etapa inválida "${stage}". Etapas válidas: ${stages.map((s) => s.key).join(", ")}`
              : "La organización no tiene etapas de pipeline.",
          };
        }

        const personRefs = [decisionMakerId, sponsorId].filter(
          (id): id is string => Boolean(id),
        );
        if (personRefs.length) {
          const people = await ctx.db.person.findMany({
            where: { id: { in: personRefs }, companyId },
            select: { id: true },
          });
          const found = new Set(people.map(({ id }) => id));
          const missing = personRefs.filter((id) => !found.has(id));
          if (missing.length) {
            return {
              error: `Los contactos ${missing.join(", ")} no existen o no pertenecen a la empresa ${companyId}.`,
            };
          }
        }

        const afterValue = {
          name,
          stage: target.key,
          estimatedValue: estimatedValue ?? null,
          probability: probability ?? null,
          source: source ?? null,
          mainPain: mainPain ?? null,
          urgency: urgency ?? null,
          decisionMakerId: decisionMakerId ?? null,
          sponsorId: sponsorId ?? null,
          nextStep: nextStep ?? null,
          nextStepDueDate: nextStepDueDate ?? null,
          expectedCloseDate: expectedCloseDate ?? null,
          status: status ?? "open",
          lossReason: lossReason ?? null,
        };

        return registerProposalChange(ctx, { companyId }, [
          {
            type: "add_opportunity",
            entity: "opportunity",
            entityId: null,
            beforeValue: null,
            afterValue,
            explanation: reason,
            confidence,
            evidence: evidence ?? null,
            label: `Nueva oportunidad en ${company.name}`,
            before: "—",
            after: `${name} (${target.label})${estimatedValue ? ` · $${estimatedValue}` : ""}`,
          },
        ]);
      },
    }),

    create_company: defineAgentTool({
      description:
        "Propone dar de alta una empresa nueva. NO la crea: genera una propuesta que el usuario aprueba en el chat.",
      inputSchema: z.object({
        name: z.string().min(1),
        website: z.string().optional(),
        industry: z.string().optional(),
        size: z.string().optional(),
        country: z.string().optional(),
        city: z.string().optional(),
        linkedinUrl: z.string().optional(),
        description: z.string().optional(),
        icpScore: z.number().int().min(0).max(100).optional(),
        fitScore: z.number().int().min(0).max(100).optional(),
        painScore: z.number().int().min(0).max(100).optional(),
        status: z.string().optional(),
        source: z.string().optional(),
        priority: z.string().optional(),
        mainPain: z.string().optional(),
        productInterest: z.string().optional(),
        potentialValue: z.number().nonnegative().optional(),
        buyingTiming: z.string().optional(),
        urgency: z.string().optional(),
        competitor: z.string().optional(),
        currentProvider: z.string().optional(),
        nextStep: z.string().optional(),
        nextStepDueDate: optionalIsoDateSchema,
        lastContactAt: optionalIsoDateSchema,
        reason: z.string().min(1),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({ name, reason, confidence, evidence, ...company }) => {
        // Evita duplicados obvios: si ya hay una empresa con el mismo nombre,
        // se avisa en vez de crear una segunda ficha para la misma cuenta.
        const existing = await ctx.db.company.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
          select: { id: true, name: true },
        });
        if (existing) {
          return {
            error: `Ya existe una empresa llamada "${existing.name}" (id: ${existing.id}). Usá update_record_fields sobre esa empresa en vez de crear una nueva.`,
          };
        }

        const afterValue = {
          name,
          website: company.website ?? null,
          industry: company.industry ?? null,
          size: company.size ?? null,
          country: company.country ?? null,
          city: company.city ?? null,
          linkedinUrl: company.linkedinUrl ?? null,
          description: company.description ?? null,
          icpScore: company.icpScore ?? null,
          fitScore: company.fitScore ?? null,
          painScore: company.painScore ?? null,
          status: company.status ?? "active",
          source: company.source ?? null,
          priority: company.priority ?? null,
          mainPain: company.mainPain ?? null,
          productInterest: company.productInterest ?? null,
          potentialValue: company.potentialValue ?? null,
          buyingTiming: company.buyingTiming ?? null,
          urgency: company.urgency ?? null,
          competitor: company.competitor ?? null,
          currentProvider: company.currentProvider ?? null,
          nextStep: company.nextStep ?? null,
          nextStepDueDate: company.nextStepDueDate ?? null,
          lastContactAt: company.lastContactAt ?? null,
        };

        return registerProposalChange(ctx, { companyId: null }, [
          {
            type: "add_company",
            entity: "company",
            entityId: null,
            beforeValue: null,
            afterValue,
            explanation: reason,
            confidence,
            evidence: evidence ?? null,
            label: "Nueva empresa",
            before: "—",
            after: `${name}${company.industry ? ` (${company.industry})` : ""}`,
          },
        ]);
      },
    }),
  };
}

// beforeValue is persisted as JSON; Dates and Prisma Decimals need casting.
function formatBeforeJson(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return String(value);
  return value as string | number | boolean;
}
