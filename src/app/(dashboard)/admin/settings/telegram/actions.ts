"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgAdminContext } from "@/lib/tenant";

// TTL del código de vinculación. Corto porque es un handshake interactivo: el
// usuario lo genera y lo manda al bot en el momento.
const LINK_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos
// Sin caracteres ambiguos (0/O, 1/I) para que sea fácil de tipear en Telegram.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generateLinkCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export type GenerateCodeState =
  | { error?: string; code?: string; expiresAt?: string }
  | undefined;

// La firma (prevState, formData) la exige useActionState aunque no usemos los args.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function generateTelegramLinkCode(
  _prevState: GenerateCodeState,
  _formData: FormData,
): Promise<GenerateCodeState> {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const { user, org, db } = await requireOrgAdminContext();

  // Un solo código válido por usuario a la vez: invalida los pendientes previos.
  await db.telegramLinkCode.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  // Reintenta ante una colisión (improbable) del code único.
  let code = generateLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.telegramLinkCode.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          code,
          expiresAt,
        },
      });
      revalidatePath("/admin/settings/telegram");
      return { code, expiresAt: expiresAt.toISOString() };
    } catch {
      code = generateLinkCode();
    }
  }
  return { error: "No se pudo generar el código. Intentá de nuevo." };
}

const unlinkSchema = z.object({
  linkId: z.string().trim().min(1),
});

export type UnlinkState = { error?: string; success?: string } | undefined;

export async function unlinkTelegramChat(
  _prevState: UnlinkState,
  formData: FormData,
): Promise<UnlinkState> {
  const { db } = await requireOrgAdminContext();

  const parsed = unlinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Vínculo inválido." };
  }

  // Desactiva en vez de borrar: preserva el historial y bloquea el ingest.
  // forOrg scopea el update a la org, así que no se puede desvincular ajeno.
  await db.telegramLink.updateMany({
    where: { id: parsed.data.linkId, isActive: true },
    data: { isActive: false, agentThreadId: null },
  });

  revalidatePath("/admin/settings/telegram");
  return { success: "Chat desvinculado." };
}
