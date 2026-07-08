"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireOrgAdminContext } from "@/lib/tenant";
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
  const { org, db } = await requireOrgAdminContext();

  const parsed = teamMemberCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revisa el formulario: email inválido." };
  }

  const { userId } = parsed.data;
  let { name, email } = parsed.data;

  // Al crear desde un usuario de Zalantos se heredan nombre y email si no se
  // escribieron a mano.
  if (userId) {
    const user = await db.user.findUnique({
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
    await db.teamMember.create({
      data: { organizationId: org.id, name, email, userId },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/team");
  return { success: "Persona agregada al equipo." };
}

export async function ensureCurrentAdminTeamMember(
  prevState: TeamMemberFormState,
): Promise<TeamMemberFormState> {
  void prevState;
  const { user, org, db } = await requireOrgAdminContext();

  try {
    await db.teamMember.upsert({
      where: { userId: user.id },
      update: {
        email: user.email,
        isActive: true,
        name: user.name ?? user.email,
      },
      create: {
        organizationId: org.id,
        name: user.name ?? user.email,
        email: user.email,
        userId: user.id,
        isActive: true,
      },
    });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/team");
  revalidatePath("/activities");
  revalidatePath("/dashboard");
  return { success: "Tu usuario ya puede recibir tareas." };
}

export async function linkTeamMemberUser(
  id: string,
  _prevState: TeamMemberFormState,
  formData: FormData,
): Promise<TeamMemberFormState> {
  const { db } = await requireOrgAdminContext();

  const raw = String(formData.get("userId") ?? "").trim();
  const userId = raw || null;

  try {
    await db.teamMember.update({
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
  const { db } = await requireOrgAdminContext();

  try {
    await db.teamMember.update({
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
  const { db } = await requireOrgAdminContext();

  // Las actividades asignadas quedan sin responsable (FK con SET NULL).
  try {
    await db.teamMember.delete({ where: { id } });
  } catch (error) {
    return { error: mutationErrorMessage(error) };
  }

  revalidatePath("/admin/team");
  revalidatePath("/activities");
  return { success: "Persona eliminada." };
}
