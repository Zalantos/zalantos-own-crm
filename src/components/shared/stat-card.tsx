import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export function StatCard({
  label,
  value,
  href,
  variant = "default",
  icon: Icon,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  variant?: "default" | "compact";
  icon?: LucideIcon;
  valueClassName?: string;
}) {
  const valueClasses = cn(
    variant === "compact" ? "text-sm" : "text-xl font-semibold",
    "truncate",
    valueClassName,
  );
  const linkClasses = cn(valueClasses, "underline underline-offset-2");

  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {Icon && <Icon className="size-3.5 shrink-0" />}
          {label}
        </p>
        {href && isExternalHref(href) ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClasses}
          >
            {value ?? "—"}
          </a>
        ) : href ? (
          <Link href={href} className={linkClasses}>
            {value ?? "—"}
          </Link>
        ) : (
          <p className={valueClasses}>{value ?? "—"}</p>
        )}
      </CardContent>
    </Card>
  );
}
