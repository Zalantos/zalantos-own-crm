import type { TenantClient } from "@/lib/tenant";

export type PageContext = {
  entityType: "company" | "opportunity" | "person" | "lead" | "inbound_lead";
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
          companyRelationships: {
            include: { company: { select: { id: true, name: true } } },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
        },
      });
      if (!person) return null;
      const fullName = `${person.firstName} ${person.lastName}`.trim();
      const primaryRelationship = person.companyRelationships.find(
        (relationship) => relationship.isPrimary,
      );
      const companies = person.companyRelationships
        .map((relationship) => relationship.company.name)
        .join(", ");
      return {
        description: `El usuario está viendo el contacto "${fullName}" (id ${person.id}${(primaryRelationship?.roleTitle ?? person.roleTitle) ? `, cargo principal: ${primaryRelationship?.roleTitle ?? person.roleTitle}` : ""})${companies ? ` relacionado con: ${companies}` : person.company ? ` de la empresa "${person.company.name}"` : ""}.`,
        companyId: primaryRelationship?.companyId ?? person.companyId,
        opportunityId: null,
      };
    }
    case "lead": {
      const lead = await db.commercialLead.findUnique({
        where: { id: context.entityId },
        select: {
          id: true,
          title: true,
          status: true,
          companyId: true,
          company: { select: { name: true } },
        },
      });
      if (!lead) return null;
      return {
        description: `El usuario está viendo el registro de prospección "${lead.title}" (id ${lead.id}, estado: ${lead.status})${lead.company ? ` de la empresa "${lead.company.name}" (id ${lead.companyId})` : ""}.`,
        companyId: lead.companyId,
        opportunityId: null,
      };
    }
    case "inbound_lead": {
      const lead = await db.inboundLead.findUnique({
        where: { id: context.entityId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          status: true,
          commercialLead: { select: { companyId: true } },
        },
      });
      if (!lead) return null;
      const fullName = [lead.firstName, lead.lastName]
        .filter(Boolean)
        .join(" ");
      return {
        description: `El usuario está viendo el lead entrante ${lead.id} (estado: ${lead.status})${fullName ? ` de "${fullName}"` : ""}${lead.company ? `, empresa declarada: "${lead.company}"` : ""}.`,
        companyId: lead.commercialLead?.companyId ?? null,
        opportunityId: null,
      };
    }
  }
}
