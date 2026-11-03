import { Prisma } from "@prisma/client";
import { normalizeEmail } from "@/lib/crm/person-dedup";
import type { InboundLeadPayload } from "@/lib/zod/inbound-lead";
import {
  inferSourceChannel,
  normalizeCampaignKey,
  type SourceChannel,
} from "@/lib/commercial/attribution";
import type { TenantClient } from "@/lib/tenant";

// Siempre hay al menos el source del canal: se registra atribución web con
// los datos recibidos. Campaña solo si vino explícita (no se infiere).
export function hasInboundAttribution(data: InboundLeadPayload): boolean {
  return Boolean(data.source);
}

export function inboundChannel(data: InboundLeadPayload): SourceChannel {
  if (data.source_channel) return data.source_channel;
  if (data.campaign_id || data.utm_campaign) return "campaign";
  const inferred = inferSourceChannel(data.source);
  return inferred === "other" ? "web" : inferred;
}

// Vincula la campaña recibida (campaign_id o utm_campaign) por key estable;
// si no existe se crea con createdVia=inbound para no perder el dato.
async function resolveInboundCampaign(
  db: TenantClient,
  organizationId: string,
  data: InboundLeadPayload,
): Promise<string | null> {
  const raw = data.campaign_id ?? data.utm_campaign;
  const key = raw ? normalizeCampaignKey(raw) : "";
  if (!raw || !key) return null;
  const campaign = await db.campaign.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: {},
    create: { organizationId, key, name: raw.slice(0, 200), createdVia: "inbound" },
    select: { id: true },
  });
  return campaign.id;
}

// Crea la atribución del lead (una sola vez). Se llama tras el create y
// también ante un reintento si la primera vez quedó sin atribución, así la
// ingesta sigue siendo idempotente y repara fallos parciales.
async function attachAttribution(
  db: TenantClient,
  organizationId: string,
  inboundLeadId: string,
  data: InboundLeadPayload,
) {
  const attribution = await db.commercialAttribution.create({
    data: {
      organizationId,
      sourceChannel: inboundChannel(data),
      campaignId: await resolveInboundCampaign(db, organizationId, data),
      utmSource: data.utm_source ?? null,
      utmMedium: data.utm_medium ?? null,
      utmCampaign: data.utm_campaign ?? null,
      utmContent: data.utm_content ?? null,
      utmTerm: data.utm_term ?? null,
      landingPage: data.landing_page ?? data.page ?? null,
      referrerUrl: data.referrer ?? null,
      sourceDetail: data.source,
      touchedAt: data.first_touch_at ?? null,
      method: "inbound",
    },
    select: { id: true },
  });
  // Condicional: si un reintento concurrente ya la adjuntó, se descarta la
  // propia para no dejar una atribución huérfana.
  const linked = await db.inboundLead.updateMany({
    where: { id: inboundLeadId, attributionId: null },
    data: { attributionId: attribution.id },
  });
  if (linked.count === 0) {
    await db.commercialAttribution.delete({ where: { id: attribution.id } });
  }
}

export type IngestInboundLeadResult = {
  inboundLeadId: string;
  created: boolean;
};

// Lógica pura de ingesta, separada del route handler para poder testearla
// con un TenantClient falso (sin NextRequest/NextResponse ni DB real). El
// create directo + catch de P2002 es idempotente bajo reintentos concurrentes
// de n8n; un findFirst-then-create no lo sería.
export async function ingestInboundLead(
  db: TenantClient,
  organizationId: string,
  data: InboundLeadPayload,
): Promise<IngestInboundLeadResult> {
  try {
    const lead = await db.inboundLead.create({
      data: {
        organizationId,
        source: data.source,
        externalId: data.external_id,
        firstName: data.first_name ?? null,
        lastName: data.last_name ?? null,
        email: normalizeEmail(data.email),
        phone: data.phone ?? null,
        company: data.company ?? null,
        message: data.message ?? null,
        page: data.page ?? null,
        status: "new",
      },
      select: { id: true },
    });
    if (hasInboundAttribution(data)) {
      await attachAttribution(db, organizationId, lead.id, data);
    }
    return { inboundLeadId: lead.id, created: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.inboundLead.findFirst({
        where: { source: data.source, externalId: data.external_id },
        select: { id: true, attributionId: true },
      });
      if (existing) {
        if (!existing.attributionId && hasInboundAttribution(data)) {
          await attachAttribution(db, organizationId, existing.id, data);
        }
        return { inboundLeadId: existing.id, created: false };
      }
    }
    throw error;
  }
}
