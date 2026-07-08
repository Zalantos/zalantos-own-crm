"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireOrgAdminContext, type TenantClient } from "@/lib/tenant";

const passwordSchema = z.string().min(8);

const createUserSchema = z.object({
  name: z.string().trim().optional(),
  email: z.email(),
  password: passwordSchema,
  role: z.enum(Role),
});

const roleSchema = z.object({
  role: z.enum(Role),
});

const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export type UserFormState =
  | {
      error?: string;
      success?: string;
    }
  | undefined;

async function countActiveAdmins(db: TenantClient) {
  return db.user.count({
    where: {
      role: "ADMIN",
      isActive: true,
    },
  });
}

async function canRemoveActiveAdmin(db: TenantClient, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });

  if (!user) {
    return { ok: false, error: "Usuario no encontrado." };
  }

  if (user.role !== "ADMIN" || !user.isActive) {
    return { ok: true };
  }

  const activeAdmins = await countActiveAdmins(db);
  if (activeAdmins <= 1) {
    return {
      ok: false,
      error: "No puedes dejar el CRM sin un admin activo.",
    };
  }

  return { ok: true };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function mutationErrorMessage(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "Ya existe un usuario con ese email.";
  }

  return "No se pudo guardar el cambio. Intenta nuevamente.";
}

export async function createUser(
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const { org, db } = await requireOrgAdminContext();

  const raw = Object.fromEntries(formData);
  const parsed = createUserSchema.safeParse({
    ...raw,
    email: normalizeEmail(String(raw.email ?? "")),
    name: String(raw.name ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return {
      error:
        "Revisa el formulario: email válido, contraseña de al menos 8 caracteres y rol válido.",
    };
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await db.user.create({
      data: {
        organizationId: org.id,
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
      },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/users");
  return { success: "Usuario creado." };
}

export async function updateUserRole(
  id: string,
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const { db } = await requireOrgAdminContext();

  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Rol inválido." };
  }

  if (parsed.data.role === "MEMBER") {
    const guard = await canRemoveActiveAdmin(db, id);
    if (!guard.ok) {
      return { error: guard.error };
    }
  }

  try {
    await db.user.update({
      where: { id },
      data: { role: parsed.data.role },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/users");
  return { success: "Rol actualizado." };
}

export async function toggleUserActive(
  id: string,
  nextIsActive: boolean,
  prevState: UserFormState,
): Promise<UserFormState> {
  void prevState;
  const { user: currentUser, db } = await requireOrgAdminContext();

  if (!nextIsActive && id === currentUser.id) {
    return { error: "No puedes desactivar tu propio usuario." };
  }

  if (!nextIsActive) {
    const guard = await canRemoveActiveAdmin(db, id);
    if (!guard.ok) {
      return { error: guard.error };
    }
  }

  try {
    await db.user.update({
      where: { id },
      data: { isActive: nextIsActive },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/users");
  return {
    success: nextIsActive ? "Usuario activado." : "Usuario desactivado.",
  };
}

export async function resetUserPassword(
  id: string,
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const { db } = await requireOrgAdminContext();

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await db.user.update({
      where: { id },
      data: { passwordHash },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/users");
  return { success: "Contraseña actualizada." };
}
