"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Send,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/i18n-provider";
import { templatesQuery } from "@/lib/queries";

type NavKey = "dashboard" | "customers" | "templates" | "campaigns" | "sendTest" | "apiLogs" | "settings";

const LINKS: { href: string; key: NavKey; icon: LucideIcon }[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/campaigns", key: "campaigns", icon: Megaphone },
  { href: "/customers", key: "customers", icon: Users },
  { href: "/templates", key: "templates", icon: FileText },
  { href: "/send-test", key: "sendTest", icon: Send },
  { href: "/api-logs", key: "apiLogs", icon: ScrollText },
  { href: "/settings", key: "settings", icon: Settings },
];

export function NavLinks({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { t } = useTranslation("nav");

  // Warm the template list on hover for the pages that open with it, so the
  // page renders with data instead of a loading state.
  function prefetch(href: string) {
    if (href === "/templates" || href === "/send-test") {
      queryClient.prefetchQuery(templatesQuery);
    }
  }

  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        const label = t(key);
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            onMouseEnter={() => prefetch(href)}
            onFocus={() => prefetch(href)}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
