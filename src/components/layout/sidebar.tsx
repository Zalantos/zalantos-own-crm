"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import {
  ADMIN_SECTION,
  CRM_SECTION,
  HOME_ITEM,
  SUPERADMIN_SECTION,
  type NavSection,
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

function NavSectionBlock({
  section,
  pathname,
  open,
  onToggle,
}: {
  section: NavSection;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const hasActiveItem = section.items.some((item) =>
    pathname.startsWith(item.href),
  );
  const itemsId = `nav-section-${section.label}`;

  return (
    <div className="space-y-1">
      {section.startCollapsed ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={itemsId}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-medium tracking-wide uppercase transition-colors",
            hasActiveItem
              ? "text-sidebar-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          )}
        >
          {section.label}
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
        </button>
      ) : (
        <p className="text-sidebar-foreground/60 px-2 text-xs font-medium tracking-wide uppercase">
          {section.label}
        </p>
      )}
      {open ? (
        <div id={itemsId} className="space-y-1">
          {section.items.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              isActive={pathname.startsWith(item.href)}
            />
          ))}
        </div>
      ) : null}
    </div>
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
  const [openLabels, setOpenLabels] = useState<Record<string, boolean>>({});
  const [openOnPath, setOpenOnPath] = useState(pathname);

  // Vuelven a cerrarse al cambiar de página para que no queden abiertas como ruido.
  if (openOnPath !== pathname) {
    setOpenOnPath(pathname);
    setOpenLabels({});
  }

  const sections = [
    CRM_SECTION,
    ...(role === "ADMIN" ? [ADMIN_SECTION] : []),
    ...(isSuperAdmin ? [SUPERADMIN_SECTION] : []),
  ];

  return (
    <aside className="bg-sidebar border-sidebar-border text-sidebar-foreground hidden min-h-0 w-56 shrink-0 flex-col overflow-y-auto border-r p-4 md:flex">
      <div className="mb-6 truncate px-2 text-lg font-semibold">
        {brandName}
      </div>
      <nav className="flex flex-1 flex-col gap-6">
        <div className="space-y-1">
          <NavLink {...HOME_ITEM} isActive={pathname === HOME_ITEM.href} />
        </div>
        {sections.map((section) => (
          <NavSectionBlock
            key={section.label}
            section={section}
            pathname={pathname}
            open={!section.startCollapsed || openLabels[section.label] === true}
            onToggle={() =>
              setOpenLabels((current) => ({
                ...current,
                [section.label]: !current[section.label],
              }))
            }
          />
        ))}
      </nav>
    </aside>
  );
}
