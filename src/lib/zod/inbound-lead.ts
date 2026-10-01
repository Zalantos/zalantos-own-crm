import { z } from "zod";

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
});

export type InboundLeadPayload = z.infer<typeof inboundLeadPayloadSchema>;

// Formulario de conversión (/leads/[id]) — decide si crear o reusar Company,
// y qué etapa inicial darle a la Opportunity.
export const convertInboundLeadSchema = z.object({
  id: z.string().min(1),
  companyId: z.preprocess(emptyToUndefined, z.string().optional()),
  companyName: optionalString,
  opportunityName: z.string().min(1, "El nombre de la oportunidad es obligatorio"),
  stageId: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type ConvertInboundLeadInput = z.infer<typeof convertInboundLeadSchema>;
