import { tool } from "ai";
import { z } from "zod";
import { OpportunityStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/zod/opportunity";
import {
  coerceFieldValue,
  getWritableFields,
  type AgentEntity,
} from "@/lib/agent/field-registry";
import { snapshotCustomFields } from "@/lib/agent/snapshot";
import { createAgentProposal } from "@/lib/agent/proposals";
import type { AgentToolContext } from "@/lib/agent/executor";

const entitySchema = z.enum(["company", "opportunity", "person"]);

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// Looks up the target record and the companyId a proposal must hang from.
async function loadTarget(entity: AgentEntity, entityId: string) {
  switch (entity) {
    case "company": {
      const record = await prisma.company.findUnique({
        where: { id: entityId },
      });
      if (!record) throw new Error(`Empresa no encontrada: ${entityId}`);
      return {
        record: record as Record<string, unknown>,
        companyId: record.id,
      };
    }
    case "opportunity": {
      const record = await prisma.opportunity.findUnique({
        where: { id: entityId },
      });
      if (!record) throw new Error(`Oportunidad no encontrada: ${entityId}`);
      return {
        record: record as unknown as Record<string, unknown>,
        companyId: record.companyId,
      };
    }
    case "person": {
      const record = await prisma.person.findUnique({
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
      }),
      execute: async ({ entity, entityId, updates, reason }) => {
        const fields = await getWritableFields(entity);
        const { record, companyId } = await loadTarget(entity, entityId);
        const customValues = await snapshotCustomFields(entity, entityId);

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
            label: spec.label,
            before:
              spec.type === "enum" ? enumLabel(before) : formatValue(before),
            after:
              spec.type === "enum" ? enumLabel(coerced) : formatValue(coerced),
          });
        }

        return createAgentProposal({
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
        "Propone un cambio de etapa de una oportunidad. NO lo aplica: crea una propuesta que el usuario aprueba en el chat.",
      inputSchema: z.object({
        opportunityId: z.string().min(1),
        stage: z.enum(OpportunityStage),
        reason: z.string().min(1),
      }),
      execute: async ({ opportunityId, stage, reason }) => {
        const opportunity = await prisma.opportunity.findUnique({
          where: { id: opportunityId },
          select: { id: true, name: true, stage: true, companyId: true },
        });
        if (!opportunity) {
          return { error: `Oportunidad no encontrada: ${opportunityId}` };
        }

        return createAgentProposal({
          threadId: ctx.threadId,
          companyId: opportunity.companyId,
          opportunityId,
          items: [
            {
              type: "stage_change",
              entity: "opportunity",
              entityId: opportunityId,
              beforeValue: { value: opportunity.stage },
              afterValue: { value: stage },
              explanation: reason,
              label: `Etapa de "${opportunity.name}"`,
              before:
                OPPORTUNITY_STAGE_LABELS[opportunity.stage] ??
                opportunity.stage,
              after: OPPORTUNITY_STAGE_LABELS[stage] ?? stage,
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
      }),
      execute: async ({ companyId, reason, ...contact }) => {
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { id: true, name: true },
        });
        if (!company) {
          return { error: `Empresa no encontrada: ${companyId}` };
        }

        const fullName =
          `${contact.firstName} ${contact.lastName ?? ""}`.trim();
        return createAgentProposal({
          threadId: ctx.threadId,
          companyId,
          opportunityId: ctx.pageContext?.opportunityId,
          items: [
            {
              type: "add_contact",
              entity: "person",
              entityId: null,
              beforeValue: null,
              afterValue: {
                firstName: contact.firstName,
                lastName: contact.lastName ?? "",
                email: contact.email ?? null,
                phone: contact.phone ?? null,
                roleTitle: contact.roleTitle ?? null,
                linkedinUrl: null,
                notes: null,
                isDecisionMaker: contact.isDecisionMaker ?? false,
                isSponsor: contact.isSponsor ?? false,
              },
              explanation: reason,
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
