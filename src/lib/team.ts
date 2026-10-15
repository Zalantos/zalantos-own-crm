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

export type AssignableUser = {
  id: string;
  name: string | null;
  email: string;
};

// Usuarios activos de la org, usados como responsables de oportunidades.
export function getActiveOrgUsers(db: TenantClient): Promise<AssignableUser[]> {
  return db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}
