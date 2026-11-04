import { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { appendTimelineEvent } from "@/lib/timeline";
import {
  ACTOR_ROLES,
  actorColumns,
  actorHref,
  actorKey,
  actorRoleLabel,
  isActorRole,
  opportunityRoleField,
  type ActorRef,
  type ActorRole,
  type ActorTarget,
} from "@/lib/commercial/actors";

type Tx = Prisma.TransactionClient;

// Escrituras de actores. Reciben un TransactionClient crudo, así que
// organizationId va explícito en cada where/data (ver withOrgTransaction).

export type ActorWriteContext = {
  organizationId: string;
  // Null para sincronizaciones sin usuario humano.
  userId: string | null;
  // manual | agent | attribution | partner_assignment | lead_conversion
  source: string;
};

export type LinkActorInput = {
  target: ActorTarget;
  actor: ActorRef;
  role: ActorRole;
  description?: string | null;
  // keep: si ya está vinculado, no hace nada (sincronizaciones automáticas).
  ifExists?: "error" | "keep";
};

export type ActorFieldName = "decisionMakerId" | "sponsorId";

export type ActorWriteResult =
  | { kind: "link"; linkId: string; created: boolean }
  | { kind: "field"; field: ActorFieldName; previous: string | null; removedLink: ActorLinkSnapshot | null };

export type ActorLinkSnapshot = {
  id: string;
  commercialLeadId: string | null;
  opportunityId: string | null;
  personId: string | null;
  companyId: string | null;
  commercialPartnerId: string | null;
  actorKey: string;
  role: string;
  description: string | null;
  linkedAt: string;
  createdById: string | null;
  source: string;
};

function targetWhere(target: ActorTarget) {
  return target.type === "opportunity"
    ? { opportunityId: target.id }
    : { commercialLeadId: target.id };
}

async function loadTarget(tx: Tx, organizationId: string, target: ActorTarget) {
  if (target.type === "opportunity") {
    const row = await tx.opportunity.findFirst({
      where: { id: target.id, organizationId },
      select: { id: true, companyId: true, name: true, decisionMakerId: true, sponsorId: true },
    });
    if (!row) throw new Error("Oportunidad no encontrada");
    return { companyId: row.companyId as string | null, opportunityId: row.id as string | null, label: row.name, row };
  }
  const row = await tx.commercialLead.findFirst({
    where: { id: target.id, organizationId },
    select: { id: true, companyId: true, title: true },
  });
  if (!row) throw new Error("Prospecto no encontrado");
  return { companyId: row.companyId, opportunityId: null, label: row.title, row: null };
}

// Valida que el actor pertenezca a la organización y devuelve su nombre.
async function loadActorName(tx: Tx, organizationId: string, actor: ActorRef) {
  if (actor.type === "person") {
    const row = await tx.person.findFirst({
      where: { id: actor.id, organizationId },
      select: { firstName: true, lastName: true },
    });
    if (!row) throw new Error("La persona indicada no existe.");
    return `${row.firstName} ${row.lastName}`.trim();
  }
  if (actor.type === "company") {
    const row = await tx.company.findFirst({
      where: { id: actor.id, organizationId },
      select: { name: true },
    });
    if (!row) throw new Error("La empresa indicada no existe.");
    return row.name;
  }
  const row = await tx.commercialPartner.findFirst({
    where: { id: actor.id, organizationId },
    select: { displayName: true },
  });
  if (!row) throw new Error("El partner indicado no existe.");
  return row.displayName;
}

function toSnapshot(link: {
  id: string;
  commercialLeadId: string | null;
  opportunityId: string | null;
  personId: string | null;
  companyId: string | null;
  commercialPartnerId: string | null;
  actorKey: string;
  role: string;
  description: string | null;
  linkedAt: Date;
  createdById: string | null;
  source: string;
}): ActorLinkSnapshot {
  return {
    id: link.id,
    commercialLeadId: link.commercialLeadId,
    opportunityId: link.opportunityId,
    personId: link.personId,
    companyId: link.companyId,
    commercialPartnerId: link.commercialPartnerId,
    actorKey: link.actorKey,
    role: link.role,
    description: link.description,
    linkedAt: link.linkedAt.toISOString(),
    createdById: link.createdById,
    source: link.source,
  };
}

async function logActorEvent(
  tx: Tx,
  ctx: ActorWriteContext,
  loaded: { companyId: string | null; opportunityId: string | null },
  title: string,
  summary: string,
) {
  await appendTimelineEvent(tx, {
    organizationId: ctx.organizationId,
    companyId: loaded.companyId,
    opportunityId: loaded.opportunityId,
    type: "actor_updated",
    title,
    summary,
    actorId: ctx.userId,
  });
}

// Fija decisor/sponsor en la oportunidad. No reemplaza en silencio a otra
// persona: el cambio de decisor es una decisión explícita.
async function setOpportunityRoleField(
  tx: Tx,
  ctx: ActorWriteContext,
  opportunityId: string,
  field: ActorFieldName,
  actor: ActorRef,
  current: string | null,
): Promise<ActorWriteResult> {
  if (current && current !== actor.id) {
    const label = field === "decisionMakerId" ? "un decisor" : "un sponsor";
    throw new Error(`La oportunidad ya tiene ${label}: desvincúlalo antes de asignar otro.`);
  }
  await tx.opportunity.update({
    where: { id: opportunityId, organizationId: ctx.organizationId },
    data: { [field]: actor.id },
  });
  // Evita mostrar a la misma persona dos veces con roles distintos.
  const duplicate = await tx.commercialActorLink.findFirst({
    where: { organizationId: ctx.organizationId, opportunityId, actorKey: actorKey(actor) },
  });
  if (duplicate) {
    await tx.commercialActorLink.delete({
      where: { id: duplicate.id, organizationId: ctx.organizationId },
    });
  }
  return {
    kind: "field",
    field,
    previous: current,
    removedLink: duplicate ? toSnapshot(duplicate) : null,
  };
}

export async function linkActorTx(
  tx: Tx,
  ctx: ActorWriteContext,
  input: LinkActorInput,
): Promise<ActorWriteResult> {
  const loaded = await loadTarget(tx, ctx.organizationId, input.target);
  const actorName = await loadActorName(tx, ctx.organizationId, input.actor);
  const roleLabel = actorRoleLabel(input.role);

  const field = opportunityRoleField(input.target, input.actor, input.role);
  if (field && loaded.row) {
    const result = await setOpportunityRoleField(
      tx,
      ctx,
      input.target.id,
      field,
      input.actor,
      loaded.row[field],
    );
    await logActorEvent(tx, ctx, loaded, `Actor vinculado: ${actorName}`, `${roleLabel} en ${loaded.label}`);
    return result;
  }

  const key = actorKey(input.actor);
  const existing = await tx.commercialActorLink.findFirst({
    where: { organizationId: ctx.organizationId, ...targetWhere(input.target), actorKey: key },
    select: { id: true },
  });
  if (existing) {
    if (input.ifExists === "keep") {
      return { kind: "link", linkId: existing.id, created: false };
    }
    throw new Error(`${actorName} ya está vinculado a este registro: edita su rol.`);
  }

  const link = await tx.commercialActorLink.create({
    data: {
      organizationId: ctx.organizationId,
      ...targetWhere(input.target),
      ...actorColumns(input.actor),
      actorKey: key,
      role: input.role,
      description: input.description?.trim() || null,
      createdById: ctx.userId,
      source: ctx.source,
    },
    select: { id: true },
  });
  await logActorEvent(tx, ctx, loaded, `Actor vinculado: ${actorName}`, `${roleLabel} en ${loaded.label}`);
  return { kind: "link", linkId: link.id, created: true };
}

export async function updateActorLinkTx(
  tx: Tx,
  ctx: ActorWriteContext,
  linkId: string,
  input: { role: ActorRole; description?: string | null },
): Promise<{ before: ActorLinkSnapshot; result: ActorWriteResult }> {
  const link = await tx.commercialActorLink.findFirst({
    where: { id: linkId, organizationId: ctx.organizationId },
  });
  if (!link) throw new Error("El actor ya no está vinculado.");
  const before = toSnapshot(link);
  const target: ActorTarget = link.opportunityId
    ? { type: "opportunity", id: link.opportunityId }
    : { type: "commercial_lead", id: link.commercialLeadId as string };
  const actor = refFromLink(link);

  const field = opportunityRoleField(target, actor, input.role);
  if (field) {
    const loaded = await loadTarget(tx, ctx.organizationId, target);
    const result = await setOpportunityRoleField(
      tx,
      ctx,
      target.id,
      field,
      actor,
      loaded.row ? loaded.row[field] : null,
    );
    return { before, result };
  }

  await tx.commercialActorLink.update({
    where: { id: link.id, organizationId: ctx.organizationId },
    data: { role: input.role, description: input.description?.trim() || null },
  });
  return { before, result: { kind: "link", linkId: link.id, created: false } };
}

export function refFromLink(link: {
  personId: string | null;
  companyId: string | null;
  commercialPartnerId: string | null;
}): ActorRef {
  if (link.personId) return { type: "person", id: link.personId };
  if (link.companyId) return { type: "company", id: link.companyId };
  return { type: "partner", id: link.commercialPartnerId as string };
}

// Desvincula sin tocar la entidad. Un partner con participación económica se
// retira primero desde Partners y economía para no dejar comisiones sueltas.
export async function unlinkActorTx(
  tx: Tx,
  ctx: ActorWriteContext,
  linkId: string,
): Promise<ActorLinkSnapshot> {
  const link = await tx.commercialActorLink.findFirst({
    where: { id: linkId, organizationId: ctx.organizationId },
  });
  if (!link) throw new Error("El actor ya no está vinculado.");
  if (link.opportunityId && link.commercialPartnerId) {
    const economic = await tx.opportunityCommercialPartner.count({
      where: {
        organizationId: ctx.organizationId,
        opportunityId: link.opportunityId,
        commercialPartnerId: link.commercialPartnerId,
      },
    });
    if (economic > 0) {
      throw new Error(
        "Este partner tiene participación económica: retíralo primero en la pestaña Partners.",
      );
    }
  }
  await tx.commercialActorLink.delete({
    where: { id: link.id, organizationId: ctx.organizationId },
  });
  const target: ActorTarget = link.opportunityId
    ? { type: "opportunity", id: link.opportunityId }
    : { type: "commercial_lead", id: link.commercialLeadId as string };
  const loaded = await loadTarget(tx, ctx.organizationId, target);
  const actorName = await loadActorName(tx, ctx.organizationId, refFromLink(link));
  await logActorEvent(tx, ctx, loaded, `Actor desvinculado: ${actorName}`, loaded.label);
  return toSnapshot(link);
}

export async function clearOpportunityRoleFieldTx(
  tx: Tx,
  ctx: ActorWriteContext,
  opportunityId: string,
  field: ActorFieldName,
): Promise<string | null> {
  const loaded = await loadTarget(tx, ctx.organizationId, { type: "opportunity", id: opportunityId });
  const previous = loaded.row ? loaded.row[field] : null;
  await tx.opportunity.update({
    where: { id: opportunityId, organizationId: ctx.organizationId },
    data: { [field]: null },
  });
  return previous;
}

export async function restoreActorLinkTx(
  tx: Tx,
  organizationId: string,
  snapshot: ActorLinkSnapshot,
) {
  await tx.commercialActorLink.create({
    data: { ...snapshot, organizationId, linkedAt: new Date(snapshot.linkedAt) },
  });
}

// La conversión conserva los actores del lead. Decisor y sponsor persona pasan
// a los campos de la oportunidad si están libres; si ya hay otra persona se
// conservan como "Otro" para no perder el dato ni duplicar el rol.
export async function copyLeadActorsToOpportunityTx(
  tx: Tx,
  ctx: ActorWriteContext,
  leadId: string,
  opportunityId: string,
) {
  const links = await tx.commercialActorLink.findMany({
    where: { organizationId: ctx.organizationId, commercialLeadId: leadId },
    orderBy: { linkedAt: "asc" },
  });
  if (links.length === 0) return;
  const opportunity = await tx.opportunity.findFirst({
    where: { id: opportunityId, organizationId: ctx.organizationId },
    select: { decisionMakerId: true, sponsorId: true },
  });
  if (!opportunity) throw new Error("Oportunidad no encontrada");

  for (const link of links) {
    const actor = refFromLink(link);
    const target: ActorTarget = { type: "opportunity", id: opportunityId };
    const field = opportunityRoleField(target, actor, link.role);
    let role = link.role;
    let description = link.description;
    if (field) {
      if (opportunity[field] === actor.id) continue;
      if (!opportunity[field]) {
        await tx.opportunity.update({
          where: { id: opportunityId, organizationId: ctx.organizationId },
          data: { [field]: actor.id },
        });
        opportunity[field] = actor.id;
        continue;
      }
      role = "other";
      description = [`${actorRoleLabel(link.role)} en el lead`, link.description]
        .filter(Boolean)
        .join(" · ");
    }
    await tx.commercialActorLink.createMany({
      data: [
        {
          organizationId: ctx.organizationId,
          opportunityId,
          ...actorColumns(actor),
          actorKey: link.actorKey,
          role,
          description,
          linkedAt: link.linkedAt,
          createdById: link.createdById,
          source: "lead_conversion",
        },
      ],
      skipDuplicates: true,
    });
  }
}

// El referidor de una atribución es un actor del registro. Sin efecto si no
// tiene referidor o si ya estaba vinculado.
export async function linkAttributionReferrersTx(
  tx: Tx,
  ctx: ActorWriteContext,
  attributionId: string | null,
  target: ActorTarget,
) {
  if (!attributionId) return;
  const attribution = await tx.commercialAttribution.findFirst({
    where: { id: attributionId, organizationId: ctx.organizationId },
    select: { referrerPersonId: true, referrerPartnerId: true },
  });
  if (!attribution) return;
  const referrers: ActorRef[] = [];
  if (attribution.referrerPartnerId) {
    referrers.push({ type: "partner", id: attribution.referrerPartnerId });
  }
  if (attribution.referrerPersonId) {
    referrers.push({ type: "person", id: attribution.referrerPersonId });
  }
  for (const actor of referrers) {
    await linkActorTx(
      tx,
      { ...ctx, source: "attribution" },
      { target, actor, role: "referrer", ifExists: "keep" },
    );
  }
}

const recordActorSelect = {
  id: true,
  role: true,
  description: true,
  linkedAt: true,
  source: true,
  person: { select: { id: true, firstName: true, lastName: true, email: true, roleTitle: true } },
  company: { select: { id: true, name: true, industry: true } },
  commercialPartner: { select: { id: true, displayName: true, allianceType: true } },
  createdBy: { select: { name: true, email: true } },
} satisfies Prisma.CommercialActorLinkSelect;

export type RecordActor = {
  // Id de la fila en la UI: el del vínculo, o el campo de la oportunidad.
  key: string;
  linkId: string | null;
  field: ActorFieldName | null;
  actor: ActorRef;
  name: string;
  detail: string | null;
  href: string;
  role: string;
  roleLabel: string;
  description: string | null;
  linkedAt: Date | null;
  recordedBy: string | null;
  // Participación económica vigente (solo partners en oportunidades).
  economicShare: string | null;
};

export async function listRecordActors(
  db: TenantClient,
  target: ActorTarget,
): Promise<RecordActor[]> {
  const links = await db.commercialActorLink.findMany({
    where: targetWhere(target),
    select: recordActorSelect,
    orderBy: { linkedAt: "asc" },
  });
  const rows: RecordActor[] = links.map((link) => {
    const actor: ActorRef = link.person
      ? { type: "person", id: link.person.id }
      : link.company
        ? { type: "company", id: link.company.id }
        : { type: "partner", id: link.commercialPartner?.id ?? "" };
    return {
      key: link.id,
      linkId: link.id,
      field: null,
      actor,
      name: link.person
        ? `${link.person.firstName} ${link.person.lastName}`.trim()
        : (link.company?.name ?? link.commercialPartner?.displayName ?? "Actor"),
      detail: link.person
        ? ([link.person.roleTitle, link.person.email].filter(Boolean).join(" · ") || null)
        : (link.company?.industry ?? null),
      href: actorHref(actor),
      role: link.role,
      roleLabel: actorRoleLabel(link.role),
      description: link.description,
      linkedAt: link.linkedAt,
      recordedBy: link.createdBy ? (link.createdBy.name ?? link.createdBy.email) : null,
      economicShare: null,
    };
  });
  if (target.type !== "opportunity") return rows;

  const [opportunity, shares] = await Promise.all([
    db.opportunity.findUnique({
      where: { id: target.id },
      select: {
        decisionMaker: { select: { id: true, firstName: true, lastName: true, email: true, roleTitle: true } },
        sponsor: { select: { id: true, firstName: true, lastName: true, email: true, roleTitle: true } },
      },
    }),
    db.opportunityCommercialPartner.findMany({
      where: { opportunityId: target.id },
      select: { commercialPartnerId: true, profitSharePercentage: true },
    }),
  ]);
  for (const row of rows) {
    if (row.actor.type !== "partner") continue;
    const share = shares.find((entry) => entry.commercialPartnerId === row.actor.id);
    if (share) row.economicShare = share.profitSharePercentage?.toString() ?? "—";
  }
  const fields = [
    { field: "decisionMakerId", role: "decision_maker", person: opportunity?.decisionMaker },
    { field: "sponsorId", role: "sponsor", person: opportunity?.sponsor },
  ] as const;
  const fieldRows: RecordActor[] = [];
  for (const { field, role, person } of fields) {
    if (!person) continue;
    const actor: ActorRef = { type: "person", id: person.id };
    fieldRows.push({
      key: `field:${field}`,
      linkId: null,
      field,
      actor,
      name: `${person.firstName} ${person.lastName}`.trim(),
      detail: [person.roleTitle, person.email].filter(Boolean).join(" · ") || null,
      href: actorHref(actor),
      role,
      roleLabel: actorRoleLabel(role),
      description: null,
      linkedAt: null,
      recordedBy: null,
      economicShare: null,
    });
  }
  return [...fieldRows, ...rows];
}

export type ActorOption = { key: string; label: string };

// Opciones de filtro: partners activos y cualquier actor ya vinculado.
export async function listActorFilterOptions(db: TenantClient): Promise<ActorOption[]> {
  const [partners, links] = await Promise.all([
    db.commercialPartner.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
    db.commercialActorLink.findMany({
      where: { commercialPartnerId: null },
      distinct: ["actorKey"],
      select: {
        actorKey: true,
        person: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
      },
    }),
  ]);
  const options: ActorOption[] = partners.map((partner) => ({
    key: actorKey({ type: "partner", id: partner.id }),
    label: `${partner.displayName} (partner)`,
  }));
  for (const link of links) {
    options.push({
      key: link.actorKey,
      label: link.person
        ? `${link.person.firstName} ${link.person.lastName}`.trim()
        : (link.company?.name ?? link.actorKey),
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export type ActorPickerOptions = {
  people: { id: string; label: string }[];
  companies: { id: string; label: string }[];
  partners: { id: string; label: string }[];
};

export async function loadActorPickerOptions(db: TenantClient): Promise<ActorPickerOptions> {
  const [people, companies, partners] = await Promise.all([
    db.person.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, company: { select: { name: true } } },
    }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.commercialPartner.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);
  return {
    people: people.map((person) => ({
      id: person.id,
      label: `${person.firstName} ${person.lastName}${person.company ? ` · ${person.company.name}` : ""}`,
    })),
    companies: companies.map((company) => ({ id: company.id, label: company.name })),
    partners: partners.map((partner) => ({ id: partner.id, label: partner.displayName })),
  };
}

// Todos los negocios en los que participa un actor (ficha de partner, persona
// o empresa). Incluye el rol de decisor/sponsor de las personas.
export async function loadActorParticipation(db: TenantClient, actor: ActorRef) {
  const key = actorKey(actor);
  const [leadLinks, opportunityLinks, fieldOpportunities] = await Promise.all([
    db.commercialActorLink.findMany({
      where: { actorKey: key, commercialLeadId: { not: null } },
      orderBy: { linkedAt: "desc" },
      select: {
        id: true,
        role: true,
        commercialLead: { select: { id: true, title: true, status: true } },
      },
    }),
    db.commercialActorLink.findMany({
      where: { actorKey: key, opportunityId: { not: null } },
      orderBy: { linkedAt: "desc" },
      select: {
        id: true,
        role: true,
        opportunity: {
          select: {
            id: true,
            name: true,
            status: true,
            estimatedValue: true,
            company: { select: { name: true } },
          },
        },
      },
    }),
    actor.type === "person"
      ? db.opportunity.findMany({
          where: { OR: [{ decisionMakerId: actor.id }, { sponsorId: actor.id }] },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            status: true,
            estimatedValue: true,
            decisionMakerId: true,
            company: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const opportunities = opportunityLinks.flatMap((link) =>
    link.opportunity ? [{ ...link.opportunity, role: link.role }] : [],
  );
  const seen = new Set(opportunities.map((opportunity) => opportunity.id));
  for (const opportunity of fieldOpportunities) {
    if (seen.has(opportunity.id)) continue;
    opportunities.push({
      id: opportunity.id,
      name: opportunity.name,
      status: opportunity.status,
      estimatedValue: opportunity.estimatedValue,
      company: opportunity.company,
      role: opportunity.decisionMakerId === actor.id ? "decision_maker" : "sponsor",
    });
  }
  return {
    leads: leadLinks.flatMap((link) =>
      link.commercialLead ? [{ ...link.commercialLead, role: link.role }] : [],
    ),
    opportunities,
  };
}

export function assertActorRole(value: unknown): ActorRole {
  if (!isActorRole(value)) {
    throw new Error(`Rol inválido. Usa uno de: ${ACTOR_ROLES.join(", ")}.`);
  }
  return value;
}
