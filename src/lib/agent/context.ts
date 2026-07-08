import type { TenantClient } from "@/lib/tenant";

export type PageContext = {
  entityType: "company" | "opportunity" | "person";
  entityId: string;
};

export type ResolvedPageContext = {
  // One-paragraph Spanish summary injected into the system prompt.
  description: string;
  companyId: string | null;
  opportunityId: string | null;
};

// Resolves the record the user is currently viewing into a short summary so
// "este deal" / "esta empresa" resolve to concrete ids. Returns null when the
// record no longer exists (stale context is not an error).
export async function resolvePageContext(
  db: TenantClient,
  context: PageContext,
): Promise<ResolvedPageContext | null> {
  switch (context.entityType) {
    case "company": {
      const company = await db.company.findUnique({
        where: { id: context.entityId },
        select: { id: true, name: true, industry: true, status: true },
      });
      if (!company) return null;
      return {
        description: `El usuario está viendo la empresa "${company.name}" (id ${company.id}${company.industry ? `, industria: ${company.industry}` : ""}).`,
        companyId: company.id,
        opportunityId: null,
      };
    }
    case "opportunity": {
      const opportunity = await db.opportunity.findUnique({
        where: { id: context.entityId },
        select: {
          id: true,
          name: true,
          stage: { select: { label: true } },
          companyId: true,
          company: { select: { name: true } },
        },
      });
      if (!opportunity) return null;
      return {
        description: `El usuario está viendo la oportunidad "${opportunity.name}" (id ${opportunity.id}, etapa: ${opportunity.stage.label}) de la empresa "${opportunity.company.name}" (id ${opportunity.companyId}).`,
        companyId: opportunity.companyId,
        opportunityId: opportunity.id,
      };
    }
    case "person": {
      const person = await db.person.findUnique({
        where: { id: context.entityId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          roleTitle: true,
          companyId: true,
          company: { select: { name: true } },
        },
      });
      if (!person) return null;
      const fullName = `${person.firstName} ${person.lastName}`.trim();
      return {
        description: `El usuario está viendo el contacto "${fullName}" (id ${person.id}${person.roleTitle ? `, cargo: ${person.roleTitle}` : ""})${person.company ? ` de la empresa "${person.company.name}" (id ${person.companyId})` : ""}.`,
        companyId: person.companyId,
        opportunityId: null,
      };
    }
  }
}
