"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontalIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import {
  ADMIN_SECTION,
  BOTTOM_NAV_MORE_ITEMS,
  BOTTOM_NAV_PRIMARY_ITEMS,
  SUPERADMIN_SECTION,
  type NavItem,
} from "@/components/layout/nav-config";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

function isItemActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

function BottomNavLink({
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
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.65rem]",
        isActive
          ? "text-sidebar-primary"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function MoreNavLink({ href, label, icon: Icon }: NavItem) {
  return (
    <SheetClose
      nativeButton={false}
      render={
        <Link
          href={href}
          className="text-foreground hover:bg-muted flex items-center gap-2 rounded-md px-2 py-2 text-sm"
        />
      }
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </SheetClose>
  );
}

export function BottomNav({
  role,
  isSuperAdmin,
}: {
  role: Role;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const moreItems = [
    ...BOTTOM_NAV_MORE_ITEMS,
    ...(role === "ADMIN" ? ADMIN_SECTION.items : []),
    ...(isSuperAdmin ? SUPERADMIN_SECTION.items : []),
  ];
  const isMoreActive = moreItems.some((item) =>
    isItemActive(pathname, item.href),
  );

  return (
    <nav
      className="bg-sidebar border-sidebar-border text-sidebar-foreground fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {BOTTOM_NAV_PRIMARY_ITEMS.map((item) => (
        <BottomNavLink
          key={item.href}
          {...item}
          isActive={isItemActive(pathname, item.href)}
        />
      ))}
      <Sheet>
        <SheetTrigger
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.65rem]",
            isMoreActive
              ? "text-sidebar-primary"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
          )}
        >
          <MoreHorizontalIcon className="size-5 shrink-0" />
          <span>Más</span>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Más opciones</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 p-4 pt-0">
            {moreItems.map((item) => (
              <MoreNavLink key={item.href} {...item} />
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
