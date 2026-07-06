"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { teamMemberCreateSchema } from "@/lib/zod/team-member";

export type TeamMemberFormState =
  | {
      error?: string;
      success?: string;
    }
  | undefined;

function mutationErrorMessage(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "Ese usuario ya está vinculado a otra persona del equipo.";
  }

  return "No se pudo guardar el cambio. Intenta nuevamente.";
}

export async function createTeamMember(
  _prevState: TeamMemberFormState,
  formData: FormData,
): Promise<TeamMemberFormState> {
  await requireAdmin();

  const parsed = teamMemberCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revisa el formulario: email inválido." };
  }

  const { userId } = parsed.data;
  let { name, email } = parsed.data;

  // Al crear desde un usuario de Zalantos se heredan nombre y email si no se
  // escribieron a mano.
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) {
      return { error: "Usuario no encontrado." };
    }
    name = name ?? user.name ?? user.email;
    email = email ?? user.email;
  }

  if (!name) {
    return { error: "El nombre es obligatorio para personas sin usuario." };
  }

  try {
    await prisma.teamMember.create({
      data: { name, email, userId },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/team");
  return { success: "Persona agregada al equipo." };
}

export async function linkTeamMemberUser(
  id: string,
  _prevState: TeamMemberFormState,
  formData: FormData,
): Promise<TeamMemberFormState> {
  await requireAdmin();

  const raw = String(formData.get("userId") ?? "").trim();
  const userId = raw || null;

  try {
    await prisma.teamMember.update({
      where: { id },
      data: { userId },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/team");
  return {
    success: userId ? "Usuario vinculado." : "Vínculo eliminado.",
  };
}

export async function toggleTeamMemberActive(
  id: string,
  nextIsActive: boolean,
  prevState: TeamMemberFormState,
): Promise<TeamMemberFormState> {
  void prevState;
  await requireAdmin();

  try {
    await prisma.teamMember.update({
      where: { id },
      data: { isActive: nextIsActive },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/team");
  return {
    success: nextIsActive ? "Persona activada." : "Persona desactivada.",
  };
}

export async function deleteTeamMember(
  id: string,
  prevState: TeamMemberFormState,
): Promise<TeamMemberFormState> {
  void prevState;
  await requireAdmin();

  // Las actividades asignadas quedan sin responsable (FK con SET NULL).
  try {
    await prisma.teamMember.delete({ where: { id } });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/team");
  revalidatePath("/activities");
  return { success: "Persona eliminada." };
}
