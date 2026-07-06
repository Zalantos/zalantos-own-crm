import { prisma } from "@/lib/prisma";

export type AssignableTeamMember = {
  id: string;
  name: string;
  userId: string | null;
};

export function getActiveTeamMembers(): Promise<AssignableTeamMember[]> {
  return prisma.teamMember.findMany({
    where: { isActive: true },
    select: { id: true, name: true, userId: true },
    orderBy: { name: "asc" },
  });
}
