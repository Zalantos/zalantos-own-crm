import type { TenantClient } from "@/lib/tenant";

export type RecordLinks = {
  companyId?: string | null;
  personId?: string | null;
  opportunityId?: string | null;
  commercialLeadId?: string | null;
  commercialPartnerId?: string | null;
};

// Verifica que cada id vinculado exista en la organización (db está
// scopeado: un id ajeno no aparece) y deriva la empresa cuando no viene. Las
// FKs de Postgres no distinguen tenants, así que esta validación evita
// asociar notas/actividades a registros de otra organización.
export async function resolveRecordLinks(
  db: TenantClient,
  links: RecordLinks,
): Promise<{ ok: true; companyId: string | null } | { ok: false; error: string }> {
  const [company, person, opportunity, lead, partner] = await Promise.all([
    links.companyId
      ? db.company.findUnique({ where: { id: links.companyId }, select: { id: true } })
      : null,
    links.personId
      ? db.person.findUnique({ where: { id: links.personId }, select: { companyId: true } })
      : null,
    links.opportunityId
      ? db.opportunity.findUnique({ where: { id: links.opportunityId }, select: { companyId: true } })
      : null,
    links.commercialLeadId
      ? db.commercialLead.findUnique({ where: { id: links.commercialLeadId }, select: { companyId: true } })
      : null,
    links.commercialPartnerId
      ? db.commercialPartner.findUnique({
          where: { id: links.commercialPartnerId },
          select: { linkedCompanyId: true },
        })
      : null,
  ]);
  if (links.companyId && !company) return { ok: false, error: "La empresa no existe." };
  if (links.personId && !person) return { ok: false, error: "La persona no existe." };
  if (links.opportunityId && !opportunity) return { ok: false, error: "La oportunidad no existe." };
  if (links.commercialLeadId && !lead) return { ok: false, error: "El prospecto no existe." };
  if (links.commercialPartnerId && !partner) return { ok: false, error: "El partner no existe." };
  return {
    ok: true,
    companyId:
      links.companyId ??
      opportunity?.companyId ??
      lead?.companyId ??
      person?.companyId ??
      partner?.linkedCompanyId ??
      null,
  };
}

export function recordParentPath(entity: RecordLinks): string {
  if (entity.opportunityId) return `/opportunities/${entity.opportunityId}`;
  if (entity.commercialLeadId) return `/prospecting/${entity.commercialLeadId}`;
  if (entity.commercialPartnerId) return `/partners/${entity.commercialPartnerId}`;
  if (entity.personId) return `/people/${entity.personId}`;
  if (entity.companyId) return `/companies/${entity.companyId}`;
  return "/activities";
}
