import { requireOrgContext } from "@/lib/tenant";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirige a /superadmin si el usuario es super-admin sin organización.
  const { user, org } = await requireOrgContext();
  const brandName = org.brandName ?? org.name;

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar
        role={user.role}
        isSuperAdmin={user.isSuperAdmin}
        brandName={brandName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={user.name ?? user.email} />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav role={user.role} isSuperAdmin={user.isSuperAdmin} />
    </div>
  );
}
