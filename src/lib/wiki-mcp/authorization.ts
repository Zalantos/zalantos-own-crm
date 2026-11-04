import type { Role } from "@prisma/client";
import { prismaSystem } from "@/lib/prisma";
import { wikiAllowedOrgIds } from "./config";
import { WikiMcpError } from "./errors";

// La identidad de servicio de la Wiki es corporativa de Zalantos: ve lo mismo sea
// quien sea el tenant que pregunta. Por eso el acceso se decide aquí, por
// organización, y una lista vacía deja la integración apagada para todos.
// Para abrir el acceso por rol o por grupo, este es el único punto a cambiar.
const WIKI_ALLOWED_ROLES = new Set<Role>(["ADMIN", "MEMBER"]);
const WIKI_CHANNELS = new Set<string>(["web", "telegram"]);

export type WikiAccessRequest = {
  organizationId: string;
  userId: string;
  channel: string;
};

export function isWikiEnabledForOrg(organizationId: string): boolean {
  return wikiAllowedOrgIds().has(organizationId);
}

type WikiUser = {
  isActive: boolean;
  role: Role;
  organizationId: string | null;
  organization: { isActive: boolean } | null;
};

function findWikiUser(userId: string): Promise<WikiUser | null> {
  return prismaSystem.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      role: true,
      organizationId: true,
      organization: { select: { isActive: true } },
    },
  });
}

// Se ejecuta en cada llamada a una tool, con el organizationId y userId de la
// sesión. Telegram resuelve el vínculo sin mirar si el usuario o la organización
// siguen activos, así que se comprueba aquí contra la base.
export async function authorizeWikiAccess(
  { organizationId, userId, channel }: WikiAccessRequest,
  findUser: (userId: string) => Promise<WikiUser | null> = findWikiUser,
): Promise<void> {
  if (!WIKI_CHANNELS.has(channel) || !isWikiEnabledForOrg(organizationId)) {
    throw new WikiMcpError("access_denied");
  }
  const user = await findUser(userId);
  if (
    !user?.isActive ||
    user.organizationId !== organizationId ||
    !user.organization?.isActive ||
    !WIKI_ALLOWED_ROLES.has(user.role)
  ) {
    throw new WikiMcpError("access_denied");
  }
}
