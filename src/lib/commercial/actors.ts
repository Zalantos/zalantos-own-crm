import type { Prisma } from "@prisma/client";

// Constantes y reglas puras (seguras para componentes cliente). Los servicios
// con base de datos viven en actor-service.ts.
// Un actor comercial es una persona, empresa o partner que participa o influye
// en un prospecto, lead u oportunidad. Es distinto del responsable interno
// (ownerId) y no implica comisión: la participación económica sigue en
// OpportunityCommercialPartner y en las ofertas.
export const ACTOR_TYPES = ["person", "company", "partner"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  person: "Persona",
  company: "Empresa",
  partner: "Partner",
};

export const ACTOR_ROLES = [
  "referrer",
  "commercial_partner",
  "intermediary",
  "collaborator",
  "sponsor",
  "decision_maker",
  "other",
] as const;

export type ActorRole = (typeof ACTOR_ROLES)[number];

export const ACTOR_ROLE_LABELS: Record<ActorRole, string> = {
  referrer: "Referidor",
  commercial_partner: "Partner comercial",
  intermediary: "Intermediario",
  collaborator: "Colaborador",
  sponsor: "Sponsor",
  decision_maker: "Decisor",
  other: "Otro",
};

export function isActorRole(value: unknown): value is ActorRole {
  return typeof value === "string" && (ACTOR_ROLES as readonly string[]).includes(value);
}

export function actorRoleLabel(value: string) {
  return isActorRole(value) ? ACTOR_ROLE_LABELS[value] : value;
}

export type ActorRef = { type: ActorType; id: string };

export type ActorTarget = {
  type: "opportunity" | "commercial_lead";
  id: string;
};

export function actorKey(ref: ActorRef) {
  return `${ref.type}:${ref.id}`;
}

export function parseActorKey(value: string | null | undefined): ActorRef | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id || !(ACTOR_TYPES as readonly string[]).includes(type)) return null;
  return { type: type as ActorType, id };
}

export function actorColumns(ref: ActorRef) {
  return {
    personId: ref.type === "person" ? ref.id : null,
    companyId: ref.type === "company" ? ref.id : null,
    commercialPartnerId: ref.type === "partner" ? ref.id : null,
  };
}

export function actorHref(ref: ActorRef) {
  if (ref.type === "person") return `/people/${ref.id}`;
  if (ref.type === "company") return `/companies/${ref.id}`;
  return `/partners/${ref.id}`;
}

// Decisor y sponsor persona de una oportunidad ya están modelados en
// Opportunity: se escriben allí y nunca se duplican como vínculo.
export function opportunityRoleField(
  target: ActorTarget,
  actor: ActorRef,
  role: string,
): "decisionMakerId" | "sponsorId" | null {
  if (target.type !== "opportunity" || actor.type !== "person") return null;
  if (role === "decision_maker") return "decisionMakerId";
  if (role === "sponsor") return "sponsorId";
  return null;
}

// Filtros por actor. Las personas también cuentan como participantes cuando
// figuran como decisor o sponsor de la oportunidad.
export function actorOpportunityWhere(ref: ActorRef): Prisma.OpportunityWhereInput {
  const linked: Prisma.OpportunityWhereInput = {
    actorLinks: { some: { actorKey: actorKey(ref) } },
  };
  if (ref.type !== "person") return linked;
  return { OR: [linked, { decisionMakerId: ref.id }, { sponsorId: ref.id }] };
}

export function actorLeadWhere(ref: ActorRef): Prisma.CommercialLeadWhereInput {
  return { actorLinks: { some: { actorKey: actorKey(ref) } } };
}

// Select compacto para tarjetas y listas: alcanza para contar y nombrar actores.
export const actorLinkSummarySelect = {
  id: true,
  role: true,
  person: { select: { firstName: true, lastName: true } },
  company: { select: { name: true } },
  commercialPartner: { select: { displayName: true } },
} satisfies Prisma.CommercialActorLinkSelect;

export type ActorLinkSummary = Prisma.CommercialActorLinkGetPayload<{
  select: typeof actorLinkSummarySelect;
}>;

export function actorLinkName(link: ActorLinkSummary) {
  if (link.person) return `${link.person.firstName} ${link.person.lastName}`.trim();
  return link.company?.name ?? link.commercialPartner?.displayName ?? "Actor";
}

export function actorChipLabels(links: ActorLinkSummary[]) {
  return links.map((link) => `${actorLinkName(link)} (${actorRoleLabel(link.role)})`);
}
