import type { TenantClient } from "@/lib/tenant";
import type { ContextEntityType } from "@/lib/entity-context/types";

export type ResolvedContextEntity = {
  entityType: ContextEntityType;
  entityId: string;
  companyId: string | null;
  opportunityId: string | null;
  personId: string | null;
  revalidatePath: string;
};

// Resolves the CRM entity and denormalized ids needed for proposals/timeline.
export async function resolveContextEntity(
  db: TenantClient,
  entityType: ContextEntityType,
  entityId: string,
): Promise<ResolvedContextEntity | null> {
  if (entityType === "company") {
    const company = await db.company.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    if (!company) return null;
    return {
      entityType,
      entityId,
      companyId: company.id,
      opportunityId: null,
      personId: null,
      revalidatePath: `/companies/${company.id}`,
    };
  }

  if (entityType === "person") {
    const person = await db.person.findUnique({
      where: { id: entityId },
      select: { id: true, companyId: true },
    });
    if (!person) return null;
    return {
      entityType,
      entityId,
      companyId: person.companyId,
      opportunityId: null,
      personId: person.id,
      revalidatePath: `/people/${person.id}`,
    };
  }

  const opportunity = await db.opportunity.findUnique({
    where: { id: entityId },
    select: { id: true, companyId: true },
  });
  if (!opportunity) return null;
  return {
    entityType,
    entityId,
    companyId: opportunity.companyId,
    opportunityId: opportunity.id,
    personId: null,
    revalidatePath: `/opportunities/${opportunity.id}`,
  };
}
