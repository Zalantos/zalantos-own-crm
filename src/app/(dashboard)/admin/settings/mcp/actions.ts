"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgAdminContext } from "@/lib/tenant";
import { generateToken, hashToken } from "@/lib/tokens";

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const revokeTokenSchema = z.object({
  tokenId: z.string().trim().min(1),
});

export type CreateMcpTokenState =
  { token?: string; error?: string } | undefined;

export async function createMcpToken(
  _prevState: CreateMcpTokenState,
  formData: FormData,
): Promise<CreateMcpTokenState> {
  const { user, org, db } = await requireOrgAdminContext();
  const parsed = createTokenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Ingresá un nombre de hasta 80 caracteres." };
  }

  const token = `zcrm_${generateToken()}`;
  await db.mcpAccessToken.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      name: parsed.data.name,
      tokenHash: hashToken(token),
      tokenPrefix: `${token.slice(0, 9)}…`,
    },
  });

  revalidatePath("/admin/settings/mcp");
  return { token };
}

export type RevokeMcpTokenState =
  { error?: string; success?: string } | undefined;

export async function revokeMcpToken(
  _prevState: RevokeMcpTokenState,
  formData: FormData,
): Promise<RevokeMcpTokenState> {
  const { user, db } = await requireOrgAdminContext();
  const parsed = revokeTokenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Token inválido." };

  const revoked = await db.mcpAccessToken.updateMany({
    where: {
      id: parsed.data.tokenId,
      userId: user.id,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) {
    return { error: "El token ya no está activo." };
  }

  revalidatePath("/admin/settings/mcp");
  return { success: "Token revocado." };
}
