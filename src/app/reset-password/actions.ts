"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prismaSystem } from "@/lib/prisma";
import { hashToken, passwordResetExpiry, generateToken } from "@/lib/tokens";

const requestSchema = z.object({ email: z.email() });

export type RequestResetState = { sent: boolean; devUrl?: string } | undefined;

// Respuesta siempre neutra ("si el email existe...") para no filtrar qué
// emails están registrados.
export async function requestPasswordReset(
  _prevState: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { sent: true };

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prismaSystem.user.findUnique({ where: { email } });

  if (user?.isActive) {
    const token = generateToken();
    await prismaSystem.passwordResetToken.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash: hashToken(token),
        expiresAt: passwordResetExpiry(),
      },
    });

    // Sin gateway de email configurado globalmente (v1): en dev se devuelve
    // el link para copiar; en producción se debería enviar por el gateway
    // de la org (fase de integraciones).
    if (process.env.NODE_ENV !== "production") {
      const appUrl = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
      return { sent: true, devUrl: `${appUrl}/reset-password/${token}` };
    }
  }

  return { sent: true };
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export type SetPasswordState = { error?: string; done?: boolean } | undefined;

export async function setNewPassword(
  _prevState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa el formulario." };
  }

  const resetToken = await prismaSystem.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { error: "El link no es válido o ya expiró." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prismaSystem.$transaction([
    prismaSystem.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prismaSystem.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { done: true };
}
