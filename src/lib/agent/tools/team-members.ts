import { z } from "zod";
import { defineAgentTool } from "@/lib/agent/tool-definition";
import type { AgentToolContext } from "@/lib/agent/executor";

export function buildTeamMemberTools(ctx: AgentToolContext) {
  return {
    list_team_members: defineAgentTool({
      description:
        "Lista responsables asignables con id, usuario y email. Usala antes de crear, reasignar o filtrar tareas cuando el nombre no identifique a una sola persona.",
      inputSchema: z.object({
        query: z.string().optional(),
        includeInactive: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ query, includeInactive, limit }) => ({
        teamMembers: await ctx.db.teamMember.findMany({
          where: {
            ...(includeInactive ? {} : { isActive: true }),
            ...(query
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" as const } },
                    {
                      email: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      user: {
                        email: {
                          contains: query,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
          orderBy: { name: "asc" },
          take: limit ?? 50,
          select: {
            id: true,
            userId: true,
            name: true,
            email: true,
            isActive: true,
            user: { select: { email: true } },
          },
        }),
      }),
    }),
  };
}
