import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { describeFieldsForModel } from "@/lib/agent/field-registry";
import {
  buildCompanySnapshot,
  snapshotCustomFields,
} from "@/lib/agent/snapshot";

const entitySchema = z.enum(["company", "opportunity", "person"]);

// Read tools don't need the per-turn context; kept as a builder for symmetry
// with the other tool groups.
export function buildReadTools() {
  return {
    search_crm: tool({
      description:
        "Busca empresas, personas y oportunidades por nombre o email. Usala para resolver nombres a ids antes de actuar sobre un registro.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Texto a buscar (nombre o email)"),
        entity: entitySchema
          .optional()
          .describe("Limitar la búsqueda a un tipo de entidad"),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ query, entity, limit }) => {
        const take = limit ?? 10;
        const [companies, people, opportunities] = await Promise.all([
          !entity || entity === "company"
            ? prisma.company.findMany({
                where: { name: { contains: query, mode: "insensitive" } },
                select: { id: true, name: true, status: true },
                take,
              })
            : [],
          !entity || entity === "person"
            ? prisma.person.findMany({
                where: {
                  OR: [
                    { firstName: { contains: query, mode: "insensitive" } },
                    { lastName: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                  ],
                },
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
            ? prisma.opportunity.findMany({
                where: { name: { contains: query, mode: "insensitive" } },
                select: {
                  id: true,
                  name: true,
                  stage: true,
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
            stage: o.stage,
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
            const company = await prisma.company.findUnique({
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
                  select: { id: true, name: true, stage: true },
                },
              },
            });
            if (!company) return { error: `Empresa no encontrada: ${id}` };
            return {
              ...company,
              customFields: await snapshotCustomFields("company", id),
            };
          }
          case "opportunity": {
            const opportunity = await prisma.opportunity.findUnique({
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
            return {
              ...opportunity,
              estimatedValue: opportunity.estimatedValue?.toString() ?? null,
              customFields: await snapshotCustomFields("opportunity", id),
            };
          }
          case "person": {
            const person = await prisma.person.findUnique({
              where: { id },
              include: { company: { select: { id: true, name: true } } },
            });
            if (!person) return { error: `Persona no encontrada: ${id}` };
            return {
              ...person,
              customFields: await snapshotCustomFields("person", id),
            };
          }
        }
      },
    }),

    get_company_snapshot: tool({
      description:
        "Devuelve una foto completa y acotada de una empresa: datos, oportunidades, contactos, notas y actividades recientes, y resúmenes de reuniones previas.",
      inputSchema: z.object({
        companyId: z.string().min(1),
      }),
      execute: async ({ companyId }) => buildCompanySnapshot(companyId),
    }),

    list_writable_fields: tool({
      description:
        "Lista los campos que se pueden modificar en una entidad, con su tipo, valores permitidos y campos custom. Consultala antes de proponer cambios de campos.",
      inputSchema: z.object({
        entity: entitySchema,
      }),
      execute: async ({ entity }) => ({
        entity,
        fields: await describeFieldsForModel(entity),
      }),
    }),
  };
}
