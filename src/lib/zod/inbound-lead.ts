import { z } from "zod";
import { SOURCE_CHANNELS } from "@/lib/commercial/attribution";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

// Igual que emptyToUndefined, pero además recorta espacios sobrantes antes de
// validar el formato: n8n/formularios externos suelen mandar el email con
// espacios al borde, que harían fallar z.email() aunque el email sea válido.
const emptyToUndefinedTrimmed = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : typeof val === "string" ? val.trim() : val;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

// Payload de n8n -> POST /api/integrations/inbound-leads. snake_case porque
// así lo manda el nodo HTTP de n8n; se mapea a camelCase antes de tocar Prisma.
export const inboundLeadPayloadSchema = z.object({
  source: z.string().min(1, "source es obligatorio").max(50),
  external_id: z.string().min(1, "external_id es obligatorio").max(200),
  first_name: optionalString,
  last_name: optionalString,
  email: z.preprocess(emptyToUndefinedTrimmed, z.email().optional()),
  company: optionalString,
  message: optionalString,
  page: optionalString,
  // Extensión HU-CRM-02 (todo opcional: el contrato previo sigue válido).
  phone: z.preprocess(emptyToUndefinedTrimmed, z.string().max(50).optional()),
  source_channel: z.preprocess(emptyToUndefined, z.enum(SOURCE_CHANNELS).optional()),
  campaign_id: z.preprocess(emptyToUndefinedTrimmed, z.string().max(200).optional()),
  utm_source: z.preprocess(emptyToUndefinedTrimmed, z.string().max(200).optional()),
  utm_medium: z.preprocess(emptyToUndefinedTrimmed, z.string().max(200).optional()),
  utm_campaign: z.preprocess(emptyToUndefinedTrimmed, z.string().max(200).optional()),
  utm_content: z.preprocess(emptyToUndefinedTrimmed, z.string().max(200).optional()),
  utm_term: z.preprocess(emptyToUndefinedTrimmed, z.string().max(200).optional()),
  landing_page: z.preprocess(emptyToUndefinedTrimmed, z.string().max(500).optional()),
  referrer: z.preprocess(emptyToUndefinedTrimmed, z.string().max(500).optional()),
  first_touch_at: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
});

export type InboundLeadPayload = z.infer<typeof inboundLeadPayloadSchema>;

// Formulario de conversión (/leads/[id]) — decide si crear o reusar Company,
// y qué etapa inicial darle a la Opportunity.
export const convertInboundLeadSchema = z.object({
  id: z.string().min(1),
  companyId: z.preprocess(emptyToUndefined, z.string().optional()),
  companyName: optionalString,
  opportunityName: z.preprocess(emptyToUndefined, z.string().optional()),
  stageId: z.preprocess(emptyToUndefined, z.string().optional()),
  // "lead": incorpora a Prospección como lead; "opportunity": además crea la
  // oportunidad en Discovery (ambos conservan la traza inbound → lead).
  mode: z.enum(["lead", "opportunity"]).default("opportunity"),
  personId: z.preprocess(emptyToUndefined, z.string().optional()),
  ownerId: z.preprocess(emptyToUndefined, z.string().optional()),
  interestSignal: optionalString,
}).refine((value) => value.mode === "lead" || Boolean(value.opportunityName), {
  message: "El nombre de la oportunidad es obligatorio",
  path: ["opportunityName"],
});

export type ConvertInboundLeadInput = z.infer<typeof convertInboundLeadSchema>;
