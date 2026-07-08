"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import {
  ADMIN_SECTION,
  CRM_SECTION,
  HOME_ITEM,
  SUPERADMIN_SECTION,
} from "@/components/layout/nav-config";

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar({
  role,
  isSuperAdmin,
  brandName,
}: {
  role: Role;
  isSuperAdmin?: boolean;
  brandName: string;
}) {
  const pathname = usePathname();
  const sections = [
    CRM_SECTION,
    ...(role === "ADMIN" ? [ADMIN_SECTION] : []),
    ...(isSuperAdmin ? [SUPERADMIN_SECTION] : []),
  ];

  return (
    <aside className="bg-sidebar border-sidebar-border text-sidebar-foreground hidden w-56 shrink-0 flex-col border-r p-4 md:flex">
      <div className="mb-6 truncate px-2 text-lg font-semibold">{brandName}</div>
      <nav className="flex flex-1 flex-col gap-6">
        <div className="space-y-1">
          <NavLink {...HOME_ITEM} isActive={pathname === HOME_ITEM.href} />
        </div>
        {sections.map((section) => (
          <div key={section.label} className="space-y-1">
            <p className="text-sidebar-foreground/60 px-2 text-xs font-medium tracking-wide uppercase">
              {section.label}
            </p>
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                isActive={pathname.startsWith(item.href)}
              />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
