import { tool } from "ai";
import { z } from "zod";
import type { TenantClient } from "@/lib/tenant";
import { getOrgStages, stagesByKey } from "@/lib/pipeline/stages";
import {
  coerceFieldValue,
  getWritableFields,
  type AgentEntity,
} from "@/lib/agent/field-registry";
import { snapshotCustomFields } from "@/lib/agent/snapshot";
import { createAgentProposal } from "@/lib/agent/proposals";
import { findExistingPerson } from "@/lib/crm/person-dedup";
import type { AgentToolContext } from "@/lib/agent/executor";

const entitySchema = z.enum(["company", "opportunity", "person"]);

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
    update_record_fields: tool({
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
      execute: async ({ entity, entityId, updates, reason, confidence, evidence }) => {
        const fields = await getWritableFields(ctx.db, entity);
        const { record, companyId } = await loadTarget(ctx.db, entity, entityId);
        const customValues = await snapshotCustomFields(ctx.db, entity, entityId);

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

        return createAgentProposal(ctx.db, ctx.organizationId, {
          threadId: ctx.threadId,
          companyId,
          opportunityId:
            entity === "opportunity"
              ? entityId
              : ctx.pageContext?.opportunityId,
          items,
        });
      },
    }),

    change_stage: tool({
      description:
        "Propone un cambio de etapa de una oportunidad. NO lo aplica: crea una propuesta que el usuario aprueba en el chat. El valor de `stage` es el key de una etapa según list_writable_fields.",
      inputSchema: z.object({
        opportunityId: z.string().min(1),
        stage: z.string().min(1),
        reason: z.string().min(1),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({ opportunityId, stage, reason, confidence, evidence }) => {
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

        return createAgentProposal(ctx.db, ctx.organizationId, {
          threadId: ctx.threadId,
          companyId: opportunity.companyId,
          opportunityId,
          items: [
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
        });
      },
    }),

    create_contact: tool({
      description:
        "Propone dar de alta un contacto nuevo en una empresa. NO lo crea: genera una propuesta que el usuario aprueba en el chat.",
      inputSchema: z.object({
        companyId: z.string().min(1),
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        roleTitle: z.string().optional(),
        isDecisionMaker: z.boolean().optional(),
        isSponsor: z.boolean().optional(),
        reason: z.string().min(1),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({ companyId, reason, confidence, evidence, ...contact }) => {
        const company = await ctx.db.company.findUnique({
          where: { id: companyId },
          select: { id: true, name: true },
        });
        if (!company) {
          return { error: `Empresa no encontrada: ${companyId}` };
        }

        const fullName =
          `${contact.firstName} ${contact.lastName ?? ""}`.trim();
        const afterValue = {
          firstName: contact.firstName,
          lastName: contact.lastName ?? "",
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          roleTitle: contact.roleTitle ?? null,
          linkedinUrl: null,
          notes: null,
          isDecisionMaker: contact.isDecisionMaker ?? false,
          isSponsor: contact.isSponsor ?? false,
        };

        // Dedup: if the person already exists, propose linking/completing it
        // instead of creating a duplicate.
        const existing = await findExistingPerson(ctx.db, ctx.organizationId, {
          companyId,
          email: contact.email ?? null,
          firstName: contact.firstName,
          lastName: contact.lastName ?? null,
        });

        if (existing) {
          return createAgentProposal(ctx.db, ctx.organizationId, {
            threadId: ctx.threadId,
            companyId,
            opportunityId: ctx.pageContext?.opportunityId,
            items: [
              {
                type: "link_contact",
                entity: "person",
                entityId: existing.id,
                duplicateOfId: existing.id,
                beforeValue: null,
                afterValue,
                explanation: `Ya existe ${existing.firstName} ${existing.lastName}`.trim() +
                  ` en la empresa; se propone vincularlo/completarlo. ${reason}`.trim(),
                confidence,
                evidence: evidence ?? null,
                label: `Vincular contacto existente en ${company.name}`,
                before: `${existing.firstName} ${existing.lastName}`.trim(),
                after: `${fullName}${contact.roleTitle ? ` (${contact.roleTitle})` : ""}`,
              },
            ],
          });
        }

        return createAgentProposal(ctx.db, ctx.organizationId, {
          threadId: ctx.threadId,
          companyId,
          opportunityId: ctx.pageContext?.opportunityId,
          items: [
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
        });
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
