import type { TenantClient } from "@/lib/tenant";

export type AssignableTeamMember = {
  id: string;
  name: string;
  userId: string | null;
};

export function getActiveTeamMembers(
  db: TenantClient,
): Promise<AssignableTeamMember[]> {
  return db.teamMember.findMany({
    where: { isActive: true },
    select: { id: true, name: true, userId: true },
    orderBy: { name: "asc" },
  });
}
