import type { Prisma } from "@prisma/client";
import { findExistingPerson } from "@/lib/crm/person-dedup";
import { appendTimelineEvent } from "@/lib/timeline";

const CREATED_VIA = "inbound_lead";

export type ConvertibleLead = {
  id: string;
  source: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  message: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
};

export type ConvertLeadInput = {
  companyId?: string;
  companyName?: string;
  opportunityName: string;
};

export type ConvertLeadContext = {
  organizationId: string;
  actorId: string;
};

export type ConvertLeadResult = {
  companyId: string;
  personId: string | null;
  opportunityId: string;
};

// Transacción pura (sin "use server" ni withOrgTransaction) para poder
// testearla con un tx falso. Mismo patrón que meeting-intelligence/apply.ts:
// reusa findExistingPerson (dedup de Person) y appendTimelineEvent con los
// tipos ya existentes (company_created/contact_added/contact_linked/
// opportunity_created/note_added).
export async function convertLeadTx(
  tx: Prisma.TransactionClient,
  ctx: ConvertLeadContext,
  lead: ConvertibleLead,
  input: ConvertLeadInput,
): Promise<ConvertLeadResult> {
  const timelineBase = { organizationId: ctx.organizationId, actorId: ctx.actorId };

  // ---- Company
  let company: { id: string; name: string };
  if (input.companyId) {
    const existing = await tx.company.findFirst({
      where: { id: input.companyId, organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    if (!existing) throw new Error("La empresa seleccionada no existe.");
    company = existing;
  } else {
    const created = await tx.company.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.companyName?.trim() || lead.company?.trim() || "Sin nombre",
        source: lead.source,
        createdById: ctx.actorId,
        createdVia: CREATED_VIA,
      },
      select: { id: true, name: true },
    });
    await appendTimelineEvent(tx, {
      ...timelineBase,
      companyId: created.id,
      type: "company_created",
      title: `Empresa creada: ${created.name}`,
      refType: "inbound_lead",
      refId: lead.id,
    });
    company = created;
  }

  // ---- Person (dedup existente: email primero, si no nombre+apellido en
  // la misma empresa)
  let personId: string | null = null;
  if (lead.firstName || lead.email) {
    const match = await findExistingPerson(tx, ctx.organizationId, {
      companyId: company.id,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
    });
    if (match) {
      if (match.companyId && match.companyId !== company.id) {
        throw new Error(
          `${match.firstName} ${match.lastName} ya existe en otra empresa (${match.companyName ?? "sin empresa"}); vinculalo manualmente desde su ficha.`,
        );
      }
      if (!match.companyId) {
        await tx.person.update({
          where: { id: match.id },
          data: { companyId: company.id },
        });
      }
      personId = match.id;
      await appendTimelineEvent(tx, {
        ...timelineBase,
        companyId: company.id,
        type: "contact_linked",
        title: `Contacto vinculado: ${match.firstName} ${match.lastName}`.trim(),
        refType: "inbound_lead",
        refId: lead.id,
      });
    } else {
      const person = await tx.person.create({
        data: {
          organizationId: ctx.organizationId,
          companyId: company.id,
          firstName: lead.firstName?.trim() || "Sin nombre",
          lastName: lead.lastName?.trim() || "",
          email: lead.email,
          createdById: ctx.actorId,
          createdVia: CREATED_VIA,
        },
        select: { id: true, firstName: true, lastName: true },
      });
      personId = person.id;
      await appendTimelineEvent(tx, {
        ...timelineBase,
        companyId: company.id,
        type: "contact_added",
        title: `Contacto agregado: ${person.firstName} ${person.lastName}`.trim(),
        refType: "inbound_lead",
        refId: lead.id,
      });
    }
  }

  // ---- Opportunity: primera etapa activa, sin hardcodear nombres de etapa.
  const firstStage = await tx.pipelineStage.findFirst({
    where: { organizationId: ctx.organizationId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true },
  });
  if (!firstStage) {
    throw new Error("La organización no tiene etapas de pipeline.");
  }
  const opportunity = await tx.opportunity.create({
    data: {
      organizationId: ctx.organizationId,
      companyId: company.id,
      name: input.opportunityName,
      stageId: firstStage.id,
      source: lead.source,
      decisionMakerId: personId,
      createdById: ctx.actorId,
      createdVia: CREATED_VIA,
    },
    select: { id: true, name: true },
  });
  await appendTimelineEvent(tx, {
    ...timelineBase,
    opportunityId: opportunity.id,
    companyId: company.id,
    type: "opportunity_created",
    title: `Oportunidad creada: ${opportunity.name}`,
    summary: firstStage.label,
    refType: "inbound_lead",
    refId: lead.id,
  });

  // ---- Nota con el mensaje original
  if (lead.message?.trim()) {
    const note = await tx.note.create({
      data: {
        organizationId: ctx.organizationId,
        companyId: company.id,
        personId,
        opportunityId: opportunity.id,
        title: "Mensaje original del lead",
        body: lead.message,
        createdById: ctx.actorId,
        createdVia: CREATED_VIA,
      },
      select: { id: true, body: true },
    });
    await appendTimelineEvent(tx, {
      ...timelineBase,
      companyId: company.id,
      opportunityId: opportunity.id,
      type: "note_added",
      title: "Nota: Mensaje original del lead",
      summary: note.body.length > 200 ? `${note.body.slice(0, 200)}…` : note.body,
      refType: "inbound_lead",
      refId: lead.id,
    });
  }

  await tx.inboundLead.update({
    where: { id: lead.id },
    data: {
      status: "converted",
      convertedAt: new Date(),
      convertedCompanyId: company.id,
      convertedPersonId: personId,
      convertedOpportunityId: opportunity.id,
      reviewedAt: lead.reviewedAt ?? new Date(),
      reviewedById: lead.reviewedById ?? ctx.actorId,
    },
  });

  return { companyId: company.id, personId, opportunityId: opportunity.id };
}
