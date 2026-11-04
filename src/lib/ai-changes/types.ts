// Forma de un cambio antes de escribirse como CRMChangeItem. beforeValue y
// afterValue son columnas Json; cada `type` define su propio afterValue y
// apply.ts decide cómo escribirlo en el CRM.
export type MappedChangeItem = {
  type: string;
  entity: string;
  entityId: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  confidence: number;
  explanation: string;
  evidence: string;
  // Lo fija la deduplicación cuando un add_contact pasa a link_contact.
  duplicateOfId?: string | null;
};
