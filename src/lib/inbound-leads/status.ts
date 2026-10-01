export const INBOUND_LEAD_STATUSES = [
  "new",
  "reviewed",
  "converted",
  "rejected",
] as const;

export type InboundLeadStatus = (typeof INBOUND_LEAD_STATUSES)[number];

export const INBOUND_LEAD_STATUS_LABELS: Record<InboundLeadStatus, string> = {
  new: "Nuevo",
  reviewed: "Revisado",
  converted: "Convertido",
  rejected: "Descartado",
};

export function isInboundLeadStatus(
  value: string,
): value is InboundLeadStatus {
  return (INBOUND_LEAD_STATUSES as readonly string[]).includes(value);
}
