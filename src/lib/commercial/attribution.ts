import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// Canal de origen (qué tipo de fuente), distinto de campaña (qué iniciativa)
// y de referidor (quién). Valores validados también por CHECK en SQL.
export const SOURCE_CHANNELS = [
  "referral",
  "campaign",
  "web",
  "linkedin_organic",
  "outbound",
  "event",
  "partner",
  "other",
] as const;

export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

export const SOURCE_CHANNEL_LABELS: Record<SourceChannel, string> = {
  referral: "Referido",
  campaign: "Campaña",
  web: "Web",
  linkedin_organic: "LinkedIn orgánico",
  outbound: "Outbound",
  event: "Evento",
  partner: "Partner",
  other: "Otro",
};

export function isSourceChannel(value: unknown): value is SourceChannel {
  return (
    typeof value === "string" &&
    (SOURCE_CHANNELS as readonly string[]).includes(value)
  );
}

export function sourceChannelLabel(value: string | null | undefined): string {
  if (!value) return "Sin origen";
  return isSourceChannel(value) ? SOURCE_CHANNEL_LABELS[value] : value;
}

// Mismo mapeo que usa la migración para Opportunity.source legacy. Nunca
// inventa campaña: el texto original queda en sourceDetail.
export function inferSourceChannel(raw: string | null | undefined): SourceChannel {
  const value = raw?.trim().toLowerCase() ?? "";
  if (!value) return "other";
  if (isSourceChannel(value)) return value;
  if (/(referid|referral|recomend)/.test(value)) return "referral";
  if (/(partner|alianza|aliado)/.test(value)) return "partner";
  if (/(campa|campaign|ads|anuncio)/.test(value)) return "campaign";
  if (/linkedin/.test(value)) return "linkedin_organic";
  if (/(web|website|landing|formulario|inbound|sitio)/.test(value)) return "web";
  if (/(evento|event|feria|conferencia|webinar)/.test(value)) return "event";
  if (/(outbound|prospec|cold|fr[ií]o)/.test(value)) return "outbound";
  return "other";
}

// Slug estable para emparejar utm_campaign / campaign_id con Campaign.key.
export function normalizeCampaignKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export type AttributionInput = {
  sourceChannel?: string | null;
  campaignId?: string | null;
  campaignKey?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  landingPage?: string | null;
  referrerUrl?: string | null;
  referrerPersonId?: string | null;
  referrerPartnerId?: string | null;
  sourceDetail?: string | null;
  touchedAt?: Date | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export function hasAttributionData(input: AttributionInput): boolean {
  return Object.values(input).some((value) =>
    value instanceof Date ? true : Boolean(typeof value === "string" ? value.trim() : value),
  );
}

// Canal efectivo: el explícito si es válido; si no, se deduce de los datos
// presentes (referidor > campaña > utm > landing).
export function resolveChannel(input: AttributionInput): SourceChannel {
  if (isSourceChannel(input.sourceChannel)) return input.sourceChannel;
  if (input.referrerPartnerId) return "partner";
  if (input.referrerPersonId) return "referral";
  if (input.campaignId || input.campaignKey || input.utmCampaign) return "campaign";
  if (input.sourceChannel) return inferSourceChannel(input.sourceChannel);
  if (input.utmSource || input.landingPage) return "web";
  return "other";
}

// Valida que referidores y campaña sean de la misma organización y crea la
// fila. Si llega una campaña por key inexistente se crea (createdVia indica
// el origen) para no perder el dato recibido; nunca se infiere una campaña
// que no vino en el payload.
export async function createAttribution(
  tx: Tx,
  ctx: { organizationId: string; actorId: string | null; method: string },
  input: AttributionInput,
): Promise<{ id: string }> {
  const organizationId = ctx.organizationId;

  let campaignId: string | null = null;
  if (input.campaignId) {
    const campaign = await tx.campaign.findFirst({
      where: {
        organizationId,
        OR: [{ id: input.campaignId }, { key: normalizeCampaignKey(input.campaignId) }],
      },
      select: { id: true },
    });
    if (!campaign && ctx.method !== "inbound") {
      throw new Error("La campaña seleccionada no existe.");
    }
    campaignId = campaign?.id ?? null;
  }
  const campaignKey = input.campaignKey ?? (campaignId ? null : input.campaignId ?? input.utmCampaign);
  if (!campaignId && campaignKey) {
    const key = normalizeCampaignKey(campaignKey);
    if (key) {
      const campaign = await tx.campaign.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: {},
        create: {
          organizationId,
          key,
          name: campaignKey.trim().slice(0, 200),
          createdVia: ctx.method === "inbound" ? "inbound" : "manual",
        },
        select: { id: true },
      });
      campaignId = campaign.id;
    }
  }

  if (input.referrerPersonId) {
    const person = await tx.person.findFirst({
      where: { id: input.referrerPersonId, organizationId },
      select: { id: true },
    });
    if (!person) throw new Error("La persona referidora no existe.");
  }
  if (input.referrerPartnerId) {
    const partner = await tx.commercialPartner.findFirst({
      where: { id: input.referrerPartnerId, organizationId },
      select: { id: true },
    });
    if (!partner) throw new Error("El partner referidor no existe.");
  }

  return tx.commercialAttribution.create({
    data: {
      organizationId,
      sourceChannel: resolveChannel({ ...input, campaignId }),
      campaignId,
      utmSource: clean(input.utmSource),
      utmMedium: clean(input.utmMedium),
      utmCampaign: clean(input.utmCampaign),
      utmContent: clean(input.utmContent),
      utmTerm: clean(input.utmTerm),
      landingPage: clean(input.landingPage),
      referrerUrl: clean(input.referrerUrl),
      referrerPersonId: input.referrerPersonId ?? null,
      referrerPartnerId: input.referrerPartnerId ?? null,
      sourceDetail: clean(input.sourceDetail),
      touchedAt: input.touchedAt ?? null,
      method: ctx.method,
      recordedById: ctx.actorId,
    },
    select: { id: true },
  });
}

export const attributionSummarySelect = {
  id: true,
  sourceChannel: true,
  sourceDetail: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  landingPage: true,
  touchedAt: true,
  method: true,
  campaign: { select: { id: true, name: true, key: true } },
  referrerPerson: { select: { id: true, firstName: true, lastName: true } },
  referrerPartner: { select: { id: true, displayName: true } },
} satisfies Prisma.CommercialAttributionSelect;

export type AttributionSummary = Prisma.CommercialAttributionGetPayload<{
  select: typeof attributionSummarySelect;
}>;
