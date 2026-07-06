import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={user.name ?? user.email} />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav role={user.role} />
    </div>
  );
}
