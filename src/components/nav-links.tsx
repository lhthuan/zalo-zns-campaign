"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/i18n-provider";

export function NavLinks() {
  const pathname = usePathname();
  const { t } = useTranslation("nav");

  const LINKS = [
    { href: "/dashboard", label: t("dashboard") },
    { href: "/customers", label: t("customers") },
    { href: "/templates", label: t("templates") },
    { href: "/campaigns", label: t("campaigns") },
    { href: "/send-test", label: t("sendTest") },
    { href: "/api-logs", label: t("apiLogs") },
    { href: "/settings", label: t("settings") },
  ];

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
