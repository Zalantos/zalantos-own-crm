import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaSystem } from "@/lib/prisma";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // La BD es la fuente de verdad (el JWT puede quedar stale hasta 10h).
  const dbUser = await prismaSystem.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      name: true,
      role: true,
      isActive: true,
      organizationId: true,
      isSuperAdmin: true,
    },
  });

  if (!dbUser?.isActive) {
    redirect("/login");
  }

  return {
    ...user,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    organizationId: dbUser.organizationId,
    isSuperAdmin: dbUser.isSuperAdmin,
  };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!user.isSuperAdmin) {
    redirect("/dashboard");
  }
  return user;
}
