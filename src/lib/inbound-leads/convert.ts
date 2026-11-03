import type { Prisma } from "@prisma/client";
import { findExistingPerson } from "@/lib/crm/person-dedup";
import { appendTimelineEvent } from "@/lib/timeline";
import {
  recordStageTransition,
  recordStatusChange,
} from "@/lib/commercial/history";

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
  attributionId?: string | null;
};

export type ConvertLeadInput = {
  companyId?: string;
  companyName?: string;
  // "lead": solo se incorpora a Prospección; "opportunity" (default): además
  // se crea la oportunidad en la primera etapa operativa.
  mode?: "lead" | "opportunity";
  opportunityName?: string;
  // Persona existente elegida por quien revisa (en vez del dedup automático).
  personId?: string;
  ownerId?: string;
  interestSignal?: string;
};

export type ConvertLeadContext = {
  organizationId: string;
  actorId: string;
};

export type ConvertLeadResult = {
  companyId: string;
  personId: string | null;
  commercialLeadId: string;
  opportunityId: string | null;
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
  const timelineBase = {
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
  };

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
  if (input.personId) {
    const chosen = await tx.person.findFirst({
      where: { id: input.personId, organizationId: ctx.organizationId },
      select: { id: true, companyId: true, firstName: true, lastName: true },
    });
    if (!chosen) throw new Error("La persona seleccionada no existe.");
    const relationship = await tx.personCompanyRelationship.findUnique({
      where: { personId_companyId: { personId: chosen.id, companyId: company.id } },
      select: { id: true },
    });
    if (!relationship) {
      await tx.personCompanyRelationship.create({
        data: {
          organizationId: ctx.organizationId,
          personId: chosen.id,
          companyId: company.id,
          roles: ["contact"],
          isPrimary: !chosen.companyId,
        },
      });
    }
    personId = chosen.id;
  } else if (lead.firstName || lead.email) {
    const match = await findExistingPerson(tx, ctx.organizationId, {
      companyId: company.id,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
    });
    if (match) {
      const existingRelationship =
        await tx.personCompanyRelationship.findUnique({
          where: {
            personId_companyId: { personId: match.id, companyId: company.id },
          },
          select: { id: true },
        });
      if (!existingRelationship) {
        await tx.personCompanyRelationship.create({
          data: {
            organizationId: ctx.organizationId,
            personId: match.id,
            companyId: company.id,
            roles: ["contact"],
            isPrimary: !match.companyId,
          },
        });
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
        title:
          `Contacto vinculado: ${match.firstName} ${match.lastName}`.trim(),
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
      await tx.personCompanyRelationship.create({
        data: {
          organizationId: ctx.organizationId,
          personId: person.id,
          companyId: company.id,
          roles: ["contact"],
          isPrimary: true,
        },
      });
      personId = person.id;
      await appendTimelineEvent(tx, {
        ...timelineBase,
        companyId: company.id,
        type: "contact_added",
        title:
          `Contacto agregado: ${person.firstName} ${person.lastName}`.trim(),
        refType: "inbound_lead",
        refId: lead.id,
      });
    }
  }

  // ---- Lead comercial (Prospección). Si la persona ya tiene un lead activo
  // se reutiliza y el inbound queda como su toque más reciente: el origen
  // inicial no se sobrescribe.
  const ownerId = input.ownerId ?? ctx.actorId;
  const existingLead = personId
    ? await tx.commercialLead.findFirst({
        where: {
          organizationId: ctx.organizationId,
          personId,
          status: { in: ["prospect", "contacted", "lead"] },
        },
        select: {
          id: true,
          status: true,
          inboundLeadId: true,
          becameLeadAt: true,
          firstTouchAttributionId: true,
        },
      })
    : null;
  const interestSignal =
    input.interestSignal?.trim() ||
    (lead.message?.trim()
      ? `Solicitud inbound (${lead.source}): ${lead.message.trim().slice(0, 300)}`
      : `Solicitud inbound vía ${lead.source}`);
  const now = new Date();
  let commercialLead: { id: string; status: string; firstTouchAttributionId: string | null };
  if (existingLead) {
    await tx.commercialLead.update({
      where: { id: existingLead.id, organizationId: ctx.organizationId },
      data: {
        ...(existingLead.inboundLeadId ? {} : { inboundLeadId: lead.id }),
        lastTouchAttributionId: lead.attributionId ?? undefined,
        firstTouchAttributionId: existingLead.firstTouchAttributionId ?? lead.attributionId ?? null,
        ...(existingLead.status !== "lead"
          ? { status: "lead", becameLeadAt: existingLead.becameLeadAt ?? now, statusChangedAt: now, interestSignal }
          : {}),
        lastInteractionAt: now,
      },
    });
    if (existingLead.status !== "lead") {
      await recordStatusChange(tx, {
        organizationId: ctx.organizationId,
        entityType: "commercial_lead",
        entityId: existingLead.id,
        fromValue: existingLead.status,
        toValue: "lead",
        actorId: ctx.actorId,
        source: CREATED_VIA,
        reason: interestSignal,
        metadata: { inboundLeadId: lead.id },
      });
    }
    commercialLead = {
      id: existingLead.id,
      status: "lead",
      firstTouchAttributionId: existingLead.firstTouchAttributionId ?? lead.attributionId ?? null,
    };
  } else {
    const title = [company.name, [lead.firstName, lead.lastName].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(" · ");
    const created = await tx.commercialLead.create({
      data: {
        organizationId: ctx.organizationId,
        title: title || company.name,
        companyId: company.id,
        personId,
        status: "lead",
        ownerId,
        interestSignal,
        identifiedAt: now,
        becameLeadAt: now,
        lastInteractionAt: now,
        statusChangedAt: now,
        firstTouchAttributionId: lead.attributionId ?? null,
        lastTouchAttributionId: lead.attributionId ?? null,
        inboundLeadId: lead.id,
        createdById: ctx.actorId,
        createdVia: CREATED_VIA,
      },
      select: { id: true, status: true, firstTouchAttributionId: true },
    });
    await recordStatusChange(tx, {
      organizationId: ctx.organizationId,
      entityType: "commercial_lead",
      entityId: created.id,
      fromValue: null,
      toValue: "lead",
      actorId: ctx.actorId,
      source: CREATED_VIA,
      metadata: { inboundLeadId: lead.id },
    });
    await appendTimelineEvent(tx, {
      ...timelineBase,
      companyId: company.id,
      type: "lead_created",
      title: `Lead creado desde inbound: ${title || company.name}`,
      refType: "inbound_lead",
      refId: lead.id,
    });
    commercialLead = created;
  }

  // ---- Opportunity (opcional): primera etapa operativa activa, sin
  // hardcodear nombres de etapa.
  let opportunityId: string | null = null;
  if ((input.mode ?? "opportunity") === "opportunity") {
    if (!input.opportunityName?.trim()) {
      throw new Error("El nombre de la oportunidad es obligatorio.");
    }
    const firstStage = await tx.pipelineStage.findFirst({
      where: { organizationId: ctx.organizationId, isActive: true, isWon: false, isLost: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true, key: true, label: true },
    });
    if (!firstStage) {
      throw new Error("La organización no tiene etapas de pipeline.");
    }
    const opportunity = await tx.opportunity.create({
      data: {
        organizationId: ctx.organizationId,
        companyId: company.id,
        name: input.opportunityName.trim(),
        stageId: firstStage.id,
        source: lead.source,
        decisionMakerId: personId,
        ownerId,
        commercialLeadId: commercialLead.id,
        firstTouchAttributionId: commercialLead.firstTouchAttributionId,
        statusChangedAt: now,
        createdById: ctx.actorId,
        createdVia: CREATED_VIA,
      },
      select: { id: true, name: true },
    });
    opportunityId = opportunity.id;
    await recordStageTransition(tx, {
      organizationId: ctx.organizationId,
      opportunityId: opportunity.id,
      stage: firstStage,
      actorId: ctx.actorId,
      source: CREATED_VIA,
    });
    await tx.commercialLead.update({
      where: { id: commercialLead.id, organizationId: ctx.organizationId },
      data: { status: "converted", convertedAt: now, statusChangedAt: now },
    });
    await recordStatusChange(tx, {
      organizationId: ctx.organizationId,
      entityType: "commercial_lead",
      entityId: commercialLead.id,
      fromValue: commercialLead.status,
      toValue: "converted",
      actorId: ctx.actorId,
      source: CREATED_VIA,
      metadata: { opportunityId: opportunity.id, inboundLeadId: lead.id },
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
  }

  // ---- Nota con el mensaje original
  if (lead.message?.trim()) {
    const note = await tx.note.create({
      data: {
        organizationId: ctx.organizationId,
        companyId: company.id,
        personId,
        opportunityId,
        commercialLeadId: commercialLead.id,
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
      opportunityId,
      type: "note_added",
      title: "Nota: Mensaje original del lead",
      summary:
        note.body.length > 200 ? `${note.body.slice(0, 200)}…` : note.body,
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
      convertedOpportunityId: opportunityId,
      reviewedAt: lead.reviewedAt ?? new Date(),
      reviewedById: lead.reviewedById ?? ctx.actorId,
    },
  });

  return {
    companyId: company.id,
    personId,
    commercialLeadId: commercialLead.id,
    opportunityId,
  };
}
