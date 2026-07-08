import type { TenantClient } from "@/lib/tenant";
import { findExistingPerson } from "@/lib/crm/person-dedup";
import type { MappedChangeItem } from "@/lib/meeting-intelligence/ai/mapping";

// Post-mapping dedup: turns any add_contact whose person already exists into a
// link_contact so applying it fills gaps on the existing record instead of
// creating a duplicate. mapAnalysisToItems is pure (no db), so this runs here.
export async function dedupeContactItems(
  db: TenantClient,
  organizationId: string,
  companyId: string,
  items: MappedChangeItem[],
): Promise<MappedChangeItem[]> {
  const result: MappedChangeItem[] = [];
  for (const item of items) {
    if (item.type !== "add_contact") {
      result.push(item);
      continue;
    }
    const after = (item.afterValue ?? {}) as Record<string, unknown>;
    const match = await findExistingPerson(db, organizationId, {
      companyId,
      email: after.email == null ? null : String(after.email),
      firstName: after.firstName == null ? null : String(after.firstName),
      lastName: after.lastName == null ? null : String(after.lastName),
    });
    if (!match) {
      result.push(item);
      continue;
    }
    result.push({
      ...item,
      type: "link_contact",
      entityId: match.id,
      duplicateOfId: match.id,
      // afterValue keeps the proposed fields; apply.ts fills only the empty
      // ones on the existing person and applies the decision-maker/sponsor flags.
      explanation: `Ya existe ${match.firstName} ${match.lastName}`.trim() +
        ` en la empresa; se propone vincularlo/completarlo. ${item.explanation}`.trim(),
    });
  }
  return result;
}
