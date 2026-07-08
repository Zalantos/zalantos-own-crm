import Link from "next/link";
import { requireSuperAdmin } from "@/lib/session";
import { LogoutButton } from "@/components/layout/logout-button";

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Link href="/superadmin" className="text-sm font-semibold">
            Panel de plataforma
          </Link>
          {user.organizationId && (
            <Link
              href="/dashboard"
              className="text-muted-foreground text-sm hover:underline"
            >
              Volver al CRM
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {user.name ?? user.email}
          </span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
