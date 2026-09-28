import type { Prisma } from "@prisma/client";

// Existing-contact lookup so the copilot proposes linking a person instead of
// creating a duplicate. Always scoped by organizationId (the TenantClient is
// already org-scoped, but we pass it explicitly to match the codebase pattern).

export function normalizeEmail(
  email: string | null | undefined,
): string | null {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized || null;
}

export function normalizePersonName(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export type ExistingPersonMatch = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  companyId: string | null;
  companyName: string | null;
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
  company: { select: { name: true } },
} as const;

type SelectedPerson = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  companyId: string | null;
  company: { name: string } | null;
};

type PersonFindFirst = (args: {
  where: Prisma.PersonWhereInput;
  select: typeof PERSON_SELECT;
}) => Promise<SelectedPerson | null>;

type PersonLookupClient = {
  person: unknown;
};

// Resolves an existing person to link to, or null. Email (exact, normalized)
// wins across the whole org; failing that, an exact first+last name match
// within the same company. Name matching requires companyId to avoid
// collapsing common names across different accounts.
export async function findExistingPerson(
  db: PersonLookupClient,
  organizationId: string,
  { companyId, email, firstName, lastName }: FindExistingPersonInput,
): Promise<ExistingPersonMatch | null> {
  const person = db.person as { findFirst: PersonFindFirst };
  const findFirst = person.findFirst.bind(person);
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const byEmail = await findFirst({
      where: {
        organizationId,
        email: { equals: normalizedEmail, mode: "insensitive" },
      },
      select: PERSON_SELECT,
    });
    if (byEmail) {
      const { company, ...person } = byEmail;
      return {
        ...person,
        companyName: company?.name ?? null,
        matchedBy: "email",
      };
    }
  }

  const first = normalizePersonName(firstName);
  const last = normalizePersonName(lastName);
  if (companyId && first) {
    const byName = await findFirst({
      where: {
        organizationId,
        companyId,
        firstName: { equals: first, mode: "insensitive" },
        // Match empty last names too when the proposal omits one.
        lastName: { equals: last ?? "", mode: "insensitive" },
      },
      select: PERSON_SELECT,
    });
    if (byName) {
      const { company, ...person } = byName;
      return {
        ...person,
        companyName: company?.name ?? null,
        matchedBy: "name",
      };
    }
  }

  return null;
}
