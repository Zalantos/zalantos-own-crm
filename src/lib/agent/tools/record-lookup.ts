import { z } from "zod";
import { withOrgTransaction, type TenantClient } from "@/lib/tenant";
import { evaluateWorkflows } from "@/lib/workflows/engine";

// Inyectables para tests: en producción son withOrgTransaction y el motor de
// workflows; los tests pasan versiones que corren contra un cliente en memoria.
export type WriteToolDeps = {
  transaction: typeof withOrgTransaction;
  evaluateWorkflows: typeof evaluateWorkflows;
};

export const defaultWriteToolDeps: WriteToolDeps = {
  transaction: withOrgTransaction,
  evaluateWorkflows,
};

export const ID_RULE = "Resolvé ids con search_crm; nunca inventes un id.";

export const isoDateString = (description: string) =>
  z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Fecha inválida: usar formato ISO 8601",
    })
    .describe(description);

export const emptyToNull = (value: string | undefined | null) =>
  value && value.trim() !== "" ? value : null;

// Errores de "registro inexistente": las tools los lanzan y el adaptador
// (executor o MCP) los devuelve como { error } para que el modelo corrija.
export async function assertCompany(db: TenantClient, companyId: string) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Empresa no encontrada: ${companyId}`);
  return company;
}

export async function assertOpportunityOfCompany(
  db: TenantClient,
  opportunityId: string,
  companyId: string,
) {
  const opportunity = await db.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, companyId: true },
  });
  if (!opportunity) {
    throw new Error(`Oportunidad no encontrada: ${opportunityId}`);
  }
  if (opportunity.companyId !== companyId) {
    throw new Error(
      `La oportunidad ${opportunityId} no pertenece a la empresa ${companyId}`,
    );
  }
}

export async function assertPeople(db: TenantClient, personIds: string[]) {
  const unique = [...new Set(personIds)];
  if (unique.length === 0) return unique;
  const found = await db.person.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((person) => person.id));
  const missing = unique.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Persona no encontrada: ${missing.join(", ")}`);
  }
  return unique;
}

export type AssigneeRef = {
  assigneeId?: string;
  assigneeEmail?: string;
  assigneeName?: string;
};

// Los responsables de tareas son TeamMember. Se acepta el id del
// TeamMember, el id del User vinculado, un email (del TeamMember o de su
// usuario) o un nombre inequívoco, y solo miembros activos.
export async function resolveAssignee(
  db: TenantClient,
  ref: AssigneeRef,
): Promise<{ id: string; name: string } | null> {
  const assigneeId = emptyToNull(ref.assigneeId);
  const assigneeEmail = emptyToNull(ref.assigneeEmail)?.trim();
  const assigneeName = emptyToNull(ref.assigneeName)?.trim();
  if (!assigneeId && !assigneeEmail && !assigneeName) return null;

  if (assigneeName && !assigneeId && !assigneeEmail) {
    const exact = await db.teamMember.findMany({
      where: {
        isActive: true,
        name: { equals: assigneeName, mode: "insensitive" },
      },
      take: 2,
      select: { id: true, name: true },
    });
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
      throw new Error(
        `Hay más de un responsable llamado "${assigneeName}". Usá list_team_members y enviá assigneeId o assigneeEmail.`,
      );
    }
    const partial = await db.teamMember.findMany({
      where: {
        isActive: true,
        name: { contains: assigneeName, mode: "insensitive" },
      },
      take: 3,
      select: { id: true, name: true },
    });
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      throw new Error(
        `El nombre "${assigneeName}" coincide con varias personas. Usá list_team_members y enviá assigneeId o assigneeEmail.`,
      );
    }
  }

  const member = await db.teamMember.findFirst({
    where: {
      isActive: true,
      ...(assigneeId
        ? { OR: [{ id: assigneeId }, { userId: assigneeId }] }
        : assigneeEmail
          ? {
              OR: [
                { email: { equals: assigneeEmail, mode: "insensitive" } },
                {
                  user: {
                    email: { equals: assigneeEmail, mode: "insensitive" },
                  },
                },
              ],
            }
          : { id: "__not_found__" }),
    },
    select: { id: true, name: true },
  });
  if (!member) {
    throw new Error(
      `Responsable no encontrado o inactivo: ${assigneeId ?? assigneeEmail ?? assigneeName}`,
    );
  }
  return member;
}
