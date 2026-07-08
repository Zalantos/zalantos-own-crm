"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { z } from "zod";
import { prismaSystem } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { signIn } from "@/lib/auth";

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export type AcceptInviteState = { error?: string } | undefined;

export async function acceptInvitation(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa el formulario." };
  }

  const invitation = await prismaSystem.invitation.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return { error: "La invitación no es válida o ya expiró." };
  }

  const user = await prismaSystem.user.findFirst({
    where: { email: invitation.email, organizationId: invitation.organizationId },
  });
  if (!user) {
    return { error: "El usuario de esta invitación ya no existe." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prismaSystem.$transaction([
    prismaSystem.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, passwordHash, isActive: true },
    }),
    prismaSystem.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  try {
    // On success, signIn() redirects internally (throws).
    await signIn("credentials", {
      email: user.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "No se pudo iniciar sesión. Intenta ingresar manualmente." };
    }
    throw error;
  }
}
