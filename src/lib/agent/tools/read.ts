import { tool } from "ai";
import { z } from "zod";
import { describeFieldsForModel } from "@/lib/agent/field-registry";
import {
  buildCompanySnapshot,
  snapshotCustomFields,
  snapshotEntityContext,
} from "@/lib/agent/snapshot";
import type { AgentToolContext } from "@/lib/agent/executor";

const entitySchema = z.enum(["company", "opportunity", "person"]);

export function buildReadTools(ctx: AgentToolContext) {
  const db = ctx.db;
  return {
    search_crm: tool({
      description:
        "Busca empresas, personas y oportunidades por nombre o email. Usala para resolver nombres a ids antes de actuar sobre un registro. Para conteos, sumas o filtros de pipeline usá query_opportunities.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Texto a buscar (nombre o email)"),
        entity: entitySchema
          .optional()
          .describe("Limitar la búsqueda a un tipo de entidad"),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ query, entity, limit }) => {
        const take = limit ?? 10;
        // Tokeniza para que "Juan Pablo Humenyi" matchee aunque el nombre esté
        // repartido en firstName ("Juan Pablo") y lastName ("Humenyi"): cada
        // palabra debe aparecer en algún campo (AND de tokens, OR de campos).
        // Con una sola palabra equivale al contains simple de antes.
        // Fallback a la query cruda si viniera solo con espacios: evita que un
        // AND vacío devuelva la tabla entera.
        const tokens = query.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) tokens.push(query.trim());
        const companyWhere = {
          AND: tokens.map((token) => ({
            name: { contains: token, mode: "insensitive" as const },
          })),
        };
        const personWhere = {
          AND: tokens.map((token) => ({
            OR: [
              { firstName: { contains: token, mode: "insensitive" as const } },
              { lastName: { contains: token, mode: "insensitive" as const } },
              { email: { contains: token, mode: "insensitive" as const } },
            ],
          })),
        };
        const opportunityWhere = {
          AND: tokens.map((token) => ({
            name: { contains: token, mode: "insensitive" as const },
          })),
        };
        const [companies, people, opportunities] = await Promise.all([
          !entity || entity === "company"
            ? db.company.findMany({
                where: companyWhere,
                select: { id: true, name: true, status: true },
                take,
              })
            : [],
          !entity || entity === "person"
            ? db.person.findMany({
                where: personWhere,
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  companyId: true,
                  company: { select: { name: true } },
                },
                take,
              })
            : [],
          !entity || entity === "opportunity"
            ? db.opportunity.findMany({
                where: opportunityWhere,
                select: {
                  id: true,
                  name: true,
                  stage: { select: { key: true, label: true } },
                  companyId: true,
                  company: { select: { name: true } },
                },
                take,
              })
            : [],
        ]);

        return {
          companies,
          people: people.map((p) => ({
            id: p.id,
            name: `${p.firstName} ${p.lastName}`.trim(),
            email: p.email,
            companyId: p.companyId,
            companyName: p.company?.name ?? null,
          })),
          opportunities: opportunities.map((o) => ({
            id: o.id,
            name: o.name,
            stage: o.stage.key,
            stageLabel: o.stage.label,
            companyId: o.companyId,
            companyName: o.company.name,
          })),
        };
      },
    }),

    get_record: tool({
      description:
        "Devuelve el detalle de un registro puntual (empresa, oportunidad o persona) incluyendo sus campos custom.",
      inputSchema: z.object({
        entity: entitySchema,
        id: z.string().min(1),
      }),
      execute: async ({ entity, id }) => {
        switch (entity) {
          case "company": {
            const company = await db.company.findUnique({
              where: { id },
              include: {
                people: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    roleTitle: true,
                  },
                },
                opportunities: {
                  select: {
                    id: true,
                    name: true,
                    stage: { select: { key: true, label: true } },
                  },
                },
              },
            });
            if (!company) return { error: `Empresa no encontrada: ${id}` };
            const context = await snapshotEntityContext(db, "company", id);
            return {
              ...company,
              customFields: await snapshotCustomFields(db, "company", id),
              ...context,
            };
          }
          case "opportunity": {
            const opportunity = await db.opportunity.findUnique({
              where: { id },
              include: {
                company: { select: { id: true, name: true } },
                decisionMaker: {
                  select: { id: true, firstName: true, lastName: true },
                },
                sponsor: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            });
            if (!opportunity)
              return { error: `Oportunidad no encontrada: ${id}` };
            const context = await snapshotEntityContext(
              db,
              "opportunity",
              id,
            );
            return {
              ...opportunity,
              estimatedValue: opportunity.estimatedValue?.toString() ?? null,
              customFields: await snapshotCustomFields(db, "opportunity", id),
              ...context,
            };
          }
          case "person": {
            const person = await db.person.findUnique({
              where: { id },
              include: { company: { select: { id: true, name: true } } },
            });
            if (!person) return { error: `Persona no encontrada: ${id}` };
            const context = await snapshotEntityContext(db, "person", id);
            return {
              ...person,
              customFields: await snapshotCustomFields(db, "person", id),
              ...context,
            };
          }
        }
      },
    }),

    get_company_snapshot: tool({
      description:
        "Devuelve una foto completa y acotada de una empresa: datos, oportunidades, contactos, notas y actividades recientes, y resúmenes de reuniones previas. Para el detalle de una reunión puntual usá list_meetings/get_meeting.",
      inputSchema: z.object({
        companyId: z.string().min(1),
      }),
      execute: async ({ companyId }) => buildCompanySnapshot(db, companyId),
    }),

    list_writable_fields: tool({
      description:
        "Lista los campos que se pueden modificar en una entidad, con su tipo, valores permitidos y campos custom. Consultala antes de proponer cambios de campos.",
      inputSchema: z.object({
        entity: entitySchema,
      }),
      execute: async ({ entity }) => ({
        entity,
        fields: await describeFieldsForModel(db, entity),
      }),
    }),
  };
}
