"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

const CRM_SECTION = {
  label: "CRM",
  items: [
    { href: "/companies", label: "Empresas" },
    { href: "/people", label: "Personas" },
    { href: "/opportunities", label: "Oportunidades" },
    { href: "/activities", label: "Actividades" },
    { href: "/meetings", label: "Meeting Intelligence" },
  ],
};

const ADMIN_SECTION = {
  label: "Configuración",
  items: [
    { href: "/admin/custom-fields", label: "Campos custom" },
    { href: "/admin/workflows", label: "Workflows" },
  ],
};

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const sections = role === "ADMIN" ? [CRM_SECTION, ADMIN_SECTION] : [CRM_SECTION];

  return (
    <aside className="bg-muted/20 hidden w-56 shrink-0 flex-col border-r p-4 md:flex">
      <div className="mb-6 px-2 text-lg font-semibold">CRM Zalantos</div>
      <nav className="flex flex-1 flex-col gap-6">
        {sections.map((section) => (
          <div key={section.label} className="space-y-1">
            <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
              {section.label}
            </p>
            {section.items.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/80 hover:bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
