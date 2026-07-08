"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prismaSystem } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/session";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { generateToken, hashToken, invitationExpiry } from "@/lib/tokens";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const createOrgSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  slug: z.preprocess(
    (val) => (typeof val === "string" && val.trim() ? val : undefined),
    z.string().trim().optional(),
  ),
  currency: z.string().trim().min(1).default("CLP"),
  timezone: z.string().trim().min(1).default("America/Santiago"),
  locale: z.string().trim().min(1).default("es-CL"),
});

export type SuperadminFormState =
  | { error?: string; success?: string }
  | undefined;

export async function createOrganization(
  _prevState: SuperadminFormState,
  formData: FormData,
): Promise<SuperadminFormState> {
  await requireSuperAdmin();

  const parsed = createOrgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revisa los campos del formulario." };
  }

  const slug = slugify(parsed.data.slug || parsed.data.name);
  if (!slug) {
    return { error: "No se pudo generar un slug válido a partir del nombre." };
  }

  let orgId: string;
  try {
    const org = await prismaSystem.organization.create({
      data: {
        name: parsed.data.name,
        slug,
        currency: parsed.data.currency,
        timezone: parsed.data.timezone,
        locale: parsed.data.locale,
      },
    });
    orgId = org.id;

    // Plantilla de pipeline por defecto; cada org la personaliza después.
    await prismaSystem.pipelineStage.createMany({
      data: DEFAULT_PIPELINE_STAGES.map((stage) => ({
        ...stage,
        organizationId: org.id,
      })),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "Ya existe una organización con ese slug." };
    }
    throw error;
  }

  revalidatePath("/superadmin");
  redirect(`/superadmin/${orgId}`);
}

export async function toggleOrgActive(orgId: string, nextIsActive: boolean) {
  await requireSuperAdmin();
  await prismaSystem.organization.update({
    where: { id: orgId },
    data: { isActive: nextIsActive },
  });
  revalidatePath("/superadmin");
  revalidatePath(`/superadmin/${orgId}`);
}

const inviteAdminSchema = z.object({
  email: z.email(),
  name: z.string().trim().optional(),
});

export type InviteFormState =
  | { error?: string; inviteUrl?: string }
  | undefined;

// Crea (o reutiliza) al usuario ADMIN de la org y una invitación para que
// fije su contraseña. No depende de email: el link se muestra para copiar.
export async function createFirstAdmin(
  orgId: string,
  _prevState: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireSuperAdmin();

  const parsed = inviteAdminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Email inválido." };
  }
  const email = parsed.data.email.trim().toLowerCase();

  const org = await prismaSystem.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) return { error: "Organización no encontrada." };

  const existing = await prismaSystem.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Ya existe un usuario con ese email." };
  }

  // Password inusable: hash bcrypt válido de un valor aleatorio que nadie
  // conoce, así el login nunca matchea hasta que se acepte la invitación.
  const unusablePasswordHash = await bcrypt.hash(generateToken(), 10);

  const token = generateToken();
  await prismaSystem.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: org.id,
        email,
        name: parsed.data.name || null,
        role: "ADMIN",
        passwordHash: unusablePasswordHash,
        isActive: true,
      },
    });
    await tx.invitation.create({
      data: {
        organizationId: org.id,
        email,
        role: "ADMIN",
        tokenHash: hashToken(token),
        invitedById: actor.id,
        expiresAt: invitationExpiry(),
      },
    });
    return user;
  });

  revalidatePath(`/superadmin/${orgId}`);
  const appUrl = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return { inviteUrl: `${appUrl}/invite/${token}` };
}
