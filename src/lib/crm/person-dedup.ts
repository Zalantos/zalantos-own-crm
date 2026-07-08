import type { TenantClient } from "@/lib/tenant";

// Existing-contact lookup so the copilot proposes linking a person instead of
// creating a duplicate. Always scoped by organizationId (the TenantClient is
// already org-scoped, but we pass it explicitly to match the codebase pattern).

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type ExistingPersonMatch = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  companyId: string | null;
  matchedBy: "email" | "name";
};

type FindExistingPersonInput = {
  companyId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  roleTitle: true,
  companyId: true,
} as const;

// Resolves an existing person to link to, or null. Email (exact, normalized)
// wins across the whole org; failing that, an exact first+last name match
// within the same company. Name matching requires companyId to avoid
// collapsing common names across different accounts.
export async function findExistingPerson(
  db: TenantClient,
  organizationId: string,
  { companyId, email, firstName, lastName }: FindExistingPersonInput,
): Promise<ExistingPersonMatch | null> {
  const normalizedEmail = email ? normalizeEmail(email) : "";
  if (normalizedEmail) {
    const byEmail = await db.person.findFirst({
      where: { organizationId, email: { equals: normalizedEmail, mode: "insensitive" } },
      select: PERSON_SELECT,
    });
    if (byEmail) return { ...byEmail, matchedBy: "email" };
  }

  const first = firstName?.trim();
  const last = lastName?.trim();
  if (companyId && first) {
    const byName = await db.person.findFirst({
      where: {
        organizationId,
        companyId,
        firstName: { equals: first, mode: "insensitive" },
        // Match empty last names too when the proposal omits one.
        lastName: { equals: last ?? "", mode: "insensitive" },
      },
      select: PERSON_SELECT,
    });
    if (byName) return { ...byName, matchedBy: "name" };
  }

  return null;
}
